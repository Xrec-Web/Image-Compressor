import type { VideoSettings } from '@/types';
import { VIDEO_FORMAT_MIME, VIDEO_RESOLUTION_HEIGHTS } from '@/types';

type FFmpegModule = typeof import('@ffmpeg/ffmpeg');
type FFmpegInstance = InstanceType<FFmpegModule['FFmpeg']>;

// Pinned to the core version that matches @ffmpeg/ffmpeg 0.12.x.
const CORE_VERSION = '0.12.10';
const CORE_BASE_ST = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd`;
const CORE_BASE_MT = `https://unpkg.com/@ffmpeg/core-mt@${CORE_VERSION}/dist/umd`;

let ffmpegPromise: Promise<FFmpegInstance> | null = null;

// One persistent progress listener forwards to whichever job is running.
// All ffmpeg work is serialized through `runExclusive`, so there is only
// ever one active job (and therefore one callback) at a time.
let activeProgressCb: ((ratio: number) => void) | null = null;

// Per-job state for deriving progress from ffmpeg's log stream. The built-in
// `progress` event is unreliable for long encodes (it can stay at 0 for
// minutes), so we also parse `Duration:` and `time=` out of the logs and
// report whichever source is further along.
let jobDurationSec = 0; // total input duration, learned from the first log line
let jobLastRatio = 0; // highest ratio reported so far (progress only moves forward)
// Ring buffer of recent log lines so a failure can report what ffmpeg actually said.
const jobLog: string[] = [];
const LOG_TAIL = 40;

function reportRatio(ratio: number): void {
  const clamped = Math.min(1, Math.max(0, ratio));
  if (clamped <= jobLastRatio) return;
  jobLastRatio = clamped;
  activeProgressCb?.(clamped);
}

/** Parse an ffmpeg `HH:MM:SS.ss` timestamp into seconds, or NaN. */
function parseTimestamp(ts: string): number {
  const m = ts.match(/(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/);
  if (!m) return NaN;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** Pull progress signals out of an ffmpeg log line. */
function handleLogLine(message: string): void {
  jobLog.push(message);
  if (jobLog.length > LOG_TAIL) jobLog.shift();

  // Total duration is printed once near the start.
  if (jobDurationSec === 0) {
    const dur = message.match(/Duration:\s*(\d+:\d{2}:\d{2}\.\d+)/);
    if (dur) {
      const secs = parseTimestamp(dur[1]);
      if (secs > 0) jobDurationSec = secs;
    }
  }
  // Encode progress lines carry `time=HH:MM:SS.ss`.
  if (jobDurationSec > 0) {
    const t = message.match(/time=\s*(\d+:\d{2}:\d{2}\.\d+)/);
    if (t) {
      const secs = parseTimestamp(t[1]);
      if (secs >= 0) reportRatio(secs / jobDurationSec);
    }
  }
}

// Simple FIFO mutex — ffmpeg.wasm can only run one exec at a time.
let queue: Promise<unknown> = Promise.resolve();

function runExclusive<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  // Keep the chain alive even if a task rejects.
  queue = run.then(() => undefined, () => undefined);
  return run;
}

/** True when the page is cross-origin isolated, enabling the faster MT core. */
export function canUseMultiThread(): boolean {
  return typeof window !== 'undefined' && (window as { crossOriginIsolated?: boolean }).crossOriginIsolated === true;
}

async function loadFFmpeg(): Promise<FFmpegInstance> {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
        import('@ffmpeg/ffmpeg'),
        import('@ffmpeg/util'),
      ]);

      const ffmpeg = new FFmpeg();
      // Two progress sources, both forwarded through reportRatio (monotonic):
      // the built-in event, plus our own parse of the log stream as a backstop.
      ffmpeg.on('progress', ({ progress }: { progress: number }) => {
        reportRatio(progress);
      });
      ffmpeg.on('log', ({ message }: { message: string }) => {
        handleLogLine(message);
      });

      const mt = canUseMultiThread();
      if (process.env.NODE_ENV !== 'production') {
        console.info(
          `[video] ffmpeg.wasm loading ${mt ? 'multi-threaded' : 'SINGLE-threaded'} core` +
            (mt ? '' : ' — set COOP/COEP headers and reload so crossOriginIsolated is true for much faster encoding.'),
        );
      }
      const base = mt ? CORE_BASE_MT : CORE_BASE_ST;

      const config: { coreURL: string; wasmURL: string; workerURL?: string } = {
        coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
      };
      if (mt) {
        config.workerURL = await toBlobURL(`${base}/ffmpeg-core.worker.js`, 'text/javascript');
      }

      await ffmpeg.load(config);
      return ffmpeg;
    })().catch((err) => {
      // Reset so a later attempt can retry from scratch.
      ffmpegPromise = null;
      throw err;
    });
  }
  return ffmpegPromise;
}

/** Warm the engine ahead of time (e.g. once a file is queued). Best-effort. */
export function preloadFFmpeg(): void {
  loadFFmpeg().catch(() => {});
}

function safeName(name: string, fallbackExt: string): string {
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : fallbackExt;
  // Strip anything ffmpeg's virtual FS might choke on.
  return `input.${ext.replace(/[^a-z0-9]/gi, '') || fallbackExt}`;
}

/**
 * Build the ffmpeg argument list for the chosen output format + settings.
 * `-2` in scale keeps the dimension divisible by 2 (required by H.264/VP9);
 * min(h\,ih) prevents upscaling past the source.
 */
function buildArgs(inputName: string, outputName: string, settings: VideoSettings): string[] {
  const { format, crf, resolution, fps, audioBitrate, faststart, stripMetadata } = settings;

  const filters: string[] = [];
  const targetHeight = VIDEO_RESOLUTION_HEIGHTS[resolution];
  if (targetHeight) filters.push(`scale=-2:min(${targetHeight}\\,ih)`);
  if (fps !== 'original') filters.push(`fps=${fps}`);

  const args: string[] = ['-i', inputName];

  if (filters.length > 0) args.push('-vf', filters.join(','));

  if (format === 'mp4') {
    // `veryfast` keeps in-browser (wasm) encoding usable; `medium` can be
    // several times slower for only a modest size win.
    args.push('-c:v', 'libx264', '-crf', String(crf), '-preset', 'veryfast', '-pix_fmt', 'yuv420p');
  } else {
    // VP9 constant-quality: -b:v 0 switches libvpx-vp9 into pure CRF mode.
    // libvpx-vp9 is very slow in wasm — cpu-used 4 + row-mt keeps it from
    // appearing frozen on large/4K sources without risking tile-size errors.
    args.push(
      '-c:v', 'libvpx-vp9', '-crf', String(crf), '-b:v', '0',
      '-deadline', 'good', '-cpu-used', '4', '-row-mt', '1',
    );
  }

  // Audio
  if (audioBitrate === 'mute') {
    args.push('-an');
  } else if (format === 'mp4') {
    args.push('-c:a', 'aac', '-b:a', `${audioBitrate}k`);
  } else {
    args.push('-c:a', 'libopus', '-b:a', `${audioBitrate}k`);
  }

  if (stripMetadata) args.push('-map_metadata', '-1');
  if (faststart && format === 'mp4') args.push('-movflags', '+faststart');

  args.push(outputName);
  return args;
}

/**
 * Compress a single video file in the browser via ffmpeg.wasm.
 * Serialized: concurrent calls queue behind one another.
 */
export async function compressVideo(
  file: File,
  settings: VideoSettings,
  onProgress?: (ratio: number) => void,
): Promise<Blob> {
  return runExclusive(async () => {
    const { fetchFile } = await import('@ffmpeg/util');
    const ffmpeg = await loadFFmpeg();

    const inputName = safeName(file.name, 'mp4');
    const outputName = `output.${settings.format}`;

    activeProgressCb = onProgress ?? null;
    jobDurationSec = 0;
    jobLastRatio = 0;
    jobLog.length = 0;
    try {
      await ffmpeg.writeFile(inputName, await fetchFile(file));

      // exec resolves with ffmpeg's exit code; non-zero means the encode failed
      // (e.g. an unsupported codec in this core build) — it does NOT throw.
      const code = await ffmpeg.exec(buildArgs(inputName, outputName, settings));
      if (code !== 0) {
        throw new Error(describeFailure(code));
      }

      const data = await ffmpeg.readFile(outputName);
      // Copy into a fresh ArrayBuffer-backed array: the MT core hands back a
      // view over a SharedArrayBuffer, which isn't a valid Blob part.
      const src = typeof data === 'string' ? new TextEncoder().encode(data) : data;
      const bytes = new Uint8Array(src.length);
      bytes.set(src);

      // Best-effort cleanup so the virtual FS doesn't accumulate across files.
      await ffmpeg.deleteFile(inputName).catch(() => {});
      await ffmpeg.deleteFile(outputName).catch(() => {});

      if (bytes.byteLength === 0) {
        throw new Error(describeFailure(0, 'ffmpeg produced an empty file'));
      }

      onProgress?.(1);
      return new Blob([bytes], { type: VIDEO_FORMAT_MIME[settings.format] });
    } catch (err) {
      // Normalize anything ffmpeg.wasm throws (numbers, strings, undefined)
      // into an Error carrying the most useful detail we have.
      if (err instanceof Error) throw err;
      throw new Error(describeFailure(typeof err === 'number' ? err : undefined, String(err)));
    } finally {
      activeProgressCb = null;
    }
  });
}

/**
 * Build a human-readable failure message from the captured ffmpeg log tail,
 * picking out the line that most likely explains the failure.
 */
function describeFailure(code?: number, fallback?: string): string {
  const tail = jobLog.join('\n');
  if (process.env.NODE_ENV !== 'production' && tail) {
    console.error('[video] ffmpeg failed. Log tail:\n' + tail);
  }

  const interesting = [...jobLog].reverse().find((l) =>
    /unknown encoder|not found|no such|invalid|unsupported|error|cannot|failed|out of memory|memory access/i.test(l),
  );

  if (interesting) {
    if (/unknown encoder/i.test(interesting)) {
      return `This build of ffmpeg can't encode that format (${interesting.trim()}). Try the other output format.`;
    }
    if (/out of memory|memory access|abort/i.test(interesting)) {
      return 'Ran out of memory while encoding. Try a smaller resolution or a shorter clip.';
    }
    return interesting.trim();
  }

  if (fallback) return fallback;
  return code != null ? `ffmpeg exited with code ${code}` : 'Compression failed';
}

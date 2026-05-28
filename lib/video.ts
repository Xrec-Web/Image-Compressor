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
      ffmpeg.on('progress', ({ progress }: { progress: number }) => {
        // ffmpeg occasionally reports >1 near the end; clamp for the UI.
        activeProgressCb?.(Math.min(1, Math.max(0, progress)));
      });

      const mt = canUseMultiThread();
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
    args.push('-c:v', 'libx264', '-crf', String(crf), '-preset', 'medium', '-pix_fmt', 'yuv420p');
  } else {
    // VP9 constant-quality: -b:v 0 switches libvpx-vp9 into pure CRF mode.
    args.push(
      '-c:v', 'libvpx-vp9', '-crf', String(crf), '-b:v', '0',
      '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2',
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
    try {
      await ffmpeg.writeFile(inputName, await fetchFile(file));
      await ffmpeg.exec(buildArgs(inputName, outputName, settings));

      const data = await ffmpeg.readFile(outputName);
      // Copy into a fresh ArrayBuffer-backed array: the MT core hands back a
      // view over a SharedArrayBuffer, which isn't a valid Blob part.
      const src = typeof data === 'string' ? new TextEncoder().encode(data) : data;
      const bytes = new Uint8Array(src.length);
      bytes.set(src);

      // Best-effort cleanup so the virtual FS doesn't accumulate across files.
      await ffmpeg.deleteFile(inputName).catch(() => {});
      await ffmpeg.deleteFile(outputName).catch(() => {});

      onProgress?.(1);
      return new Blob([bytes], { type: VIDEO_FORMAT_MIME[settings.format] });
    } finally {
      activeProgressCb = null;
    }
  });
}

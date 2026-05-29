import imageCompression from 'browser-image-compression';
import type { OutputFormat, Settings } from '@/types';
import { QUALITY_VALUES, DIMENSION_VALUES, FORMAT_MIME } from '@/types';
import { isHeicFile } from '@/lib/utils';
import { compressPdfFile } from '@/lib/pdf';

// ── Encoding (off-main-thread) ───────────────────────────────────────────────
// All raster encoding runs in a Web Worker so the multi-threaded WASM codecs
// never block the main thread (which froze the UI and logged Emscripten's
// "Blocking on the main thread is very dangerous" warning). The worker is
// created lazily on first use and reused for the rest of the session.
let _worker: Worker | null = null;
let _reqId = 0;
const _pending = new Map<
  number,
  { resolve: (buf: ArrayBuffer) => void; reject: (err: Error) => void }
>();

function getWorker(): Worker {
  if (!_worker) {
    _worker = new Worker(new URL('./encode.worker.ts', import.meta.url));
    _worker.onmessage = (e: MessageEvent<{ id: number; buffer?: ArrayBuffer; error?: string }>) => {
      const { id, buffer, error } = e.data;
      const pending = _pending.get(id);
      if (!pending) return;
      _pending.delete(id);
      if (error || !buffer) pending.reject(new Error(error ?? 'Encode failed'));
      else pending.resolve(buffer);
    };
  }
  return _worker;
}

function encodeInWorker(
  imageData: ImageData,
  format: OutputFormat,
  quality: number,
  pngColors: number | null,
): Promise<ArrayBuffer> {
  const worker = getWorker();
  const id = ++_reqId;
  return new Promise<ArrayBuffer>((resolve, reject) => {
    _pending.set(id, { resolve, reject });
    // Transfer the pixel buffer to the worker to avoid a copy of the full bitmap.
    worker.postMessage(
      {
        id,
        format,
        buffer: imageData.data.buffer,
        width: imageData.width,
        height: imageData.height,
        quality,
        pngColors,
      },
      [imageData.data.buffer],
    );
  });
}

/**
 * Decode an image blob into ImageData with optional resize. When `background`
 * is given (used for JPEG, which has no alpha) the canvas is painted with it
 * first so transparent pixels flatten onto a solid colour instead of black.
 */
async function getImageData(
  source: Blob,
  maxDimension: number | undefined,
  background?: string,
): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(source);
    const img = new Image();

    img.onload = () => {
      let w = img.naturalWidth;
      let h = img.naturalHeight;

      if (maxDimension && Math.max(w, h) > maxDimension) {
        const scale = maxDimension / Math.max(w, h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;

      if (background) {
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.drawImage(img, 0, 0, w, h);

      const imageData = ctx.getImageData(0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(imageData);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to decode image'));
    };

    img.src = url;
  });
}

/**
 * Re-encoding can produce a file *larger* than the source — most commonly with
 * lossless PNG on an already-optimized original. When the output format matches
 * the source, never hand back something bigger: keep the original bytes (and
 * therefore its identical format/extension).
 */
function keepSmaller(original: File, candidate: Blob, targetMime: string): Blob {
  if (original.type === targetMime && candidate.size >= original.size) {
    return original;
  }
  return candidate;
}

/**
 * PNG palette size per quality preset. `null` keeps PNG fully lossless (oxipng
 * only); a number triggers colour quantization so oxipng can write a small
 * indexed PNG. Lower preset → fewer colours → smaller file.
 */
const PNG_COLORS: Record<Settings['quality'], number | null> = {
  high: null,
  balanced: 256,
  small: 128,
};

/**
 * Compress a single file according to settings. The heavy encode happens in a
 * Web Worker; decoding/resizing stays on the main thread (it's cheap).
 */
export async function compressFile(file: File, settings: Settings): Promise<Blob> {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    return compressPdfFile(file, {
      quality: settings.quality,
      maxDimension: settings.maxDimension,
    });
  }

  const quality = QUALITY_VALUES[settings.quality];
  const maxDimension = DIMENSION_VALUES[settings.maxDimension];
  const format = settings.format;
  const mimeType = FORMAT_MIME[format];

  // HEIC can't be decoded via <img>, so transcode it to JPEG first; everything
  // else is decoded straight from the original blob.
  let source: Blob = file;
  if (isHeicFile(file)) {
    source = await imageCompression(file, {
      maxSizeMB: 999,
      maxWidthOrHeight: maxDimension,
      useWebWorker: false,
      fileType: 'image/jpeg',
      initialQuality: 0.98,
    });
  }

  // JPEG has no alpha channel — flatten transparency onto white.
  const background = format === 'jpg' ? '#ffffff' : undefined;
  const imageData = await getImageData(source, maxDimension, background);

  const bytes = await encodeInWorker(imageData, format, quality, PNG_COLORS[settings.quality]);
  return keepSmaller(file, new Blob([bytes], { type: mimeType }), mimeType);
}

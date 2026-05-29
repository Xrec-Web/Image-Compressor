import imageCompression from 'browser-image-compression';
import type { Settings } from '@/types';
import { QUALITY_VALUES, DIMENSION_VALUES, FORMAT_MIME } from '@/types';
import { isHeicFile } from '@/lib/utils';
import { compressPdfFile } from '@/lib/pdf';

// ── AVIF encoding (off-main-thread) ──────────────────────────────────────────
// The encode runs in a Web Worker so the multi-threaded WASM encoder never
// blocks the main thread (which froze the UI and logged Emscripten's
// "Blocking on the main thread is very dangerous" warning). The worker is
// created lazily on first AVIF use and reused for the rest of the session.
let _avifWorker: Worker | null = null;
let _avifReqId = 0;
const _avifPending = new Map<
  number,
  { resolve: (buf: ArrayBuffer) => void; reject: (err: Error) => void }
>();

function getAvifWorker(): Worker {
  if (!_avifWorker) {
    _avifWorker = new Worker(new URL('./avif.worker.ts', import.meta.url));
    _avifWorker.onmessage = (e: MessageEvent<{ id: number; buffer?: ArrayBuffer; error?: string }>) => {
      const { id, buffer, error } = e.data;
      const pending = _avifPending.get(id);
      if (!pending) return;
      _avifPending.delete(id);
      if (error || !buffer) pending.reject(new Error(error ?? 'AVIF encode failed'));
      else pending.resolve(buffer);
    };
  }
  return _avifWorker;
}

function encodeAvif(
  imageData: ImageData,
  opts: { cqLevel?: number; speed?: number },
): Promise<ArrayBuffer> {
  const worker = getAvifWorker();
  const id = ++_avifReqId;
  return new Promise<ArrayBuffer>((resolve, reject) => {
    _avifPending.set(id, { resolve, reject });
    // Transfer the pixel buffer to the worker to avoid a copy of the full bitmap.
    worker.postMessage(
      {
        id,
        buffer: imageData.data.buffer,
        width: imageData.width,
        height: imageData.height,
        cqLevel: opts.cqLevel,
        speed: opts.speed,
      },
      [imageData.data.buffer],
    );
  });
}

/**
 * Decode any image blob into an ImageData with optional resize.
 * Used for the AVIF encoding path.
 */
async function getImageData(source: Blob, maxDimension: number | undefined): Promise<ImageData> {
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
 * PNG, which is lossless and whose quality setting is ignored, so the browser's
 * encoder can't beat an already-optimized original. When the output format
 * matches the source, never hand back something bigger: keep the original bytes
 * (and therefore its identical format/extension).
 */
function keepSmaller(original: File, candidate: Blob, targetMime: string): Blob {
  if (original.type === targetMime && candidate.size >= original.size) {
    return original;
  }
  return candidate;
}

/**
 * Compress a single file according to settings.
 * Sequential-safe: no Web Workers, no parallelism.
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

  // ── AVIF path ─────────────────────────────────────────────────────────────
  if (settings.format === 'avif') {
    let source: Blob = file;

    // HEIC must be decoded first — browsers can't render it via img.src
    if (isHeicFile(file)) {
      source = await imageCompression(file, {
        maxSizeMB: 999,
        maxWidthOrHeight: maxDimension,
        useWebWorker: false,
        fileType: 'image/jpeg',
        initialQuality: 0.98,
      });
    }

    const imageData = await getImageData(source, maxDimension);

    // AVIF uses cqLevel (0 = best … 63 = worst), the inverse of our 0–100
    // quality scale, so map across: quality 100 → cqLevel 0, quality 0 → 63.
    const cqLevel = Math.round(((100 - quality) / 100) * 63);

    // speed: 8 = faster encode, minor quality trade-off; fine for web use
    const arrayBuffer = await encodeAvif(imageData, { cqLevel, speed: 8 });
    return keepSmaller(file, new Blob([arrayBuffer], { type: 'image/avif' }), 'image/avif');
  }

  // ── JPG / WebP / PNG path ───────────────────────────────────────────────────
  const mimeType = FORMAT_MIME[settings.format];

  const compressed = await imageCompression(file, {
    // Very high maxSizeMB disables size-based iteration — quality is the only lever
    maxSizeMB: 999,
    maxWidthOrHeight: maxDimension,
    useWebWorker: false,
    fileType: mimeType as 'image/jpeg' | 'image/webp' | 'image/png',
    initialQuality: quality / 100,
  });

  return keepSmaller(file, compressed, mimeType);
}

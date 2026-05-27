import imageCompression from 'browser-image-compression';
import type { Settings } from '@/types';
import { QUALITY_VALUES, DIMENSION_VALUES, FORMAT_MIME } from '@/types';
import { isHeicFile } from '@/lib/utils';

// Cached AVIF encoder — avoids re-loading WASM on every file
let _avifEncode: ((imageData: ImageData, opts?: { quality?: number; speed?: number }) => Promise<ArrayBuffer>) | null = null;

async function getAvifEncoder() {
  if (!_avifEncode) {
    // Dynamic import so WASM only loads when AVIF is actually selected
    const mod = await import('@jsquash/avif');
    _avifEncode = mod.encode;
  }
  return _avifEncode;
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
 * Compress a single file according to settings.
 * Sequential-safe: no Web Workers, no parallelism.
 */
export async function compressFile(file: File, settings: Settings): Promise<Blob> {
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
    const encode = await getAvifEncoder();

    // speed: 8 = faster encode, minor quality trade-off; fine for web use
    const arrayBuffer = await encode(imageData, { quality, speed: 8 });
    return new Blob([arrayBuffer], { type: 'image/avif' });
  }

  // ── JPG / WebP path ───────────────────────────────────────────────────────
  const mimeType = FORMAT_MIME[settings.format];

  return imageCompression(file, {
    // Very high maxSizeMB disables size-based iteration — quality is the only lever
    maxSizeMB: 999,
    maxWidthOrHeight: maxDimension,
    useWebWorker: false,
    fileType: mimeType as 'image/jpeg' | 'image/webp' | 'image/png',
    initialQuality: quality / 100,
  });
}

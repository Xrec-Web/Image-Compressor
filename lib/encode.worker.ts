/// <reference lib="webworker" />
//
// Image encoding worker.
//
// Encoding runs off the main thread so the multi-threaded WASM codecs never
// freeze the UI. Each codec is dynamically imported so its wasm chunk is only
// fetched the first time that output format is actually used.
//
//   jpg  → MozJPEG        (much smaller than the browser's canvas JPEG)
//   webp → libwebp        (method 6 = best ratio for the effort)
//   avif → libavif        (cqLevel mapped from our 0–100 quality scale)
//   png  → oxipng         (lossless), optionally preceded by image-q colour
//                          quantization so oxipng can emit a small indexed PNG

import type { OutputFormat } from '@/types';

interface EncodeRequest {
  id: number;
  format: OutputFormat;
  buffer: ArrayBuffer; // detached RGBA pixel buffer transferred from the main thread
  width: number;
  height: number;
  quality: number; // 0–100 (used by jpg/webp, and mapped to cqLevel for avif)
  pngColors: number | null; // PNG only: palette size for lossy quantize, or null for lossless
}

async function encodeImage(
  imageData: ImageData,
  format: OutputFormat,
  quality: number,
  pngColors: number | null,
): Promise<ArrayBuffer> {
  switch (format) {
    case 'jpg': {
      const { encode } = await import('@jsquash/jpeg');
      return encode(imageData, { quality });
    }
    case 'webp': {
      const { encode } = await import('@jsquash/webp');
      return encode(imageData, { quality, method: 6 });
    }
    case 'avif': {
      const { encode } = await import('@jsquash/avif');
      // AVIF uses cqLevel (0 = best … 63 = worst), the inverse of our scale.
      const cqLevel = Math.round(((100 - quality) / 100) * 63);
      // speed: 8 = faster encode, minor quality trade-off; fine for web use.
      return encode(imageData, { cqLevel, speed: 8 });
    }
    case 'png': {
      const { optimise } = await import('@jsquash/oxipng');
      let pngInput = imageData;

      // Lossy path: reduce to a ≤256-colour palette so oxipng writes an indexed
      // PNG (TinyPNG-style). Skipped at the highest quality preset (pngColors null).
      if (pngColors != null) {
        const iq = await import('image-q');
        const points = iq.utils.PointContainer.fromUint8Array(imageData.data, imageData.width, imageData.height);
        const palette = iq.buildPaletteSync([points], {
          colors: pngColors,
          paletteQuantization: 'wuquant',
        });
        const applied = iq.applyPaletteSync(points, palette, {
          imageQuantization: 'floyd-steinberg', // dither to avoid banding
        });
        pngInput = new ImageData(
          new Uint8ClampedArray(applied.toUint8Array()),
          imageData.width,
          imageData.height,
        );
      }

      return optimise(pngInput, { level: 3 });
    }
    default:
      throw new Error(`Unsupported output format: ${format}`);
  }
}

self.onmessage = async (e: MessageEvent<EncodeRequest>) => {
  const { id, format, buffer, width, height, quality, pngColors } = e.data;
  try {
    const imageData = new ImageData(new Uint8ClampedArray(buffer), width, height);
    const out = await encodeImage(imageData, format, quality, pngColors);
    // Transfer the result back to avoid a copy.
    (self as DedicatedWorkerGlobalScope).postMessage({ id, buffer: out }, [out]);
  } catch (err) {
    (self as DedicatedWorkerGlobalScope).postMessage({
      id,
      error: err instanceof Error ? err.message : 'Encode failed',
    });
  }
};

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import imageCompression from 'browser-image-compression';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

export function formatReduction(originalBytes: number, compressedBytes: number): string {
  const reduction = ((originalBytes - compressedBytes) / originalBytes) * 100;
  return `${Math.round(reduction)}%`;
}

export function getTodayString(): string {
  const d = new Date();
  return d.toISOString().split('T')[0];
}

export function isHeicFile(file: File): boolean {
  return (
    file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    file.name.toLowerCase().endsWith('.heic') ||
    file.name.toLowerCase().endsWith('.heif')
  );
}

export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

/**
 * Generate a compact thumbnail (data URL) for a file.
 * Handles HEIC by using browser-image-compression to decode first.
 */
export async function generateThumbnail(file: File): Promise<string> {
  const THUMB_SIZE = 120;

  return new Promise(async (resolve) => {
    try {
      let source: Blob = file;

      if (isHeicFile(file)) {
        // HEIC can't be decoded natively — convert to JPEG first
        source = await imageCompression(file, {
          maxSizeMB: 0.05,
          maxWidthOrHeight: THUMB_SIZE * 2,
          useWebWorker: false,
          fileType: 'image/jpeg',
          initialQuality: 0.7,
        });
      }

      const url = URL.createObjectURL(source);
      const img = new Image();

      img.onload = () => {
        const scale = Math.min(1, THUMB_SIZE / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.round(img.naturalWidth * scale);
        const h = Math.round(img.naturalHeight * scale);

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, w, h);

        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(''); // fallback to icon
      };

      img.src = url;
    } catch {
      resolve('');
    }
  });
}

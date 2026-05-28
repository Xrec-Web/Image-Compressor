import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import imageCompression from 'browser-image-compression';
import type { VideoSettings } from '@/types';
import {
  VIDEO_ACCEPTED_EXTENSIONS,
  VIDEO_ACCEPTED_MIME_TYPES,
  VIDEO_BITRATE_LADDER,
  VIDEO_CRF_RANGE,
  VIDEO_RESOLUTION_HEIGHTS,
} from '@/types';

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

export function isVideoFile(file: File): boolean {
  if (VIDEO_ACCEPTED_MIME_TYPES.includes(file.type)) return true;
  if (file.type.startsWith('video/')) return true;
  const name = file.name.toLowerCase();
  return VIDEO_ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export interface VideoMetadata {
  duration: number; // seconds
  width: number;
  height: number;
}

/** Read duration + dimensions from a video file using a detached <video> element. */
export function getVideoMetadata(file: File): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;

    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      video.load();
    };

    video.onloadedmetadata = () => {
      const meta = {
        duration: isFinite(video.duration) ? video.duration : 0,
        width: video.videoWidth,
        height: video.videoHeight,
      };
      cleanup();
      resolve(meta);
    };
    video.onerror = () => {
      cleanup();
      reject(new Error('Failed to read video metadata'));
    };

    video.src = url;
  });
}

/**
 * Grab a single frame as a thumbnail data URL — done with a <video> element,
 * so it costs nothing (the ffmpeg.wasm engine only loads at compress time).
 */
export function generateVideoThumbnail(file: File): Promise<string> {
  const THUMB_SIZE = 160;

  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.crossOrigin = 'anonymous';

    let settled = false;
    const finish = (result: string) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      video.load();
      resolve(result);
    };

    video.onloadeddata = () => {
      // Seek a touch into the clip to skip black intro frames.
      const target = Math.min(1, (video.duration || 2) / 2);
      const onSeeked = () => {
        try {
          const scale = Math.min(1, THUMB_SIZE / Math.max(video.videoWidth, video.videoHeight));
          const w = Math.max(1, Math.round(video.videoWidth * scale));
          const h = Math.max(1, Math.round(video.videoHeight * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(video, 0, 0, w, h);
          finish(canvas.toDataURL('image/jpeg', 0.7));
        } catch {
          finish('');
        }
      };
      video.onseeked = onSeeked;
      try {
        video.currentTime = target;
      } catch {
        onSeeked();
      }
    };
    video.onerror = () => finish('');

    video.src = url;
  });
}

/**
 * Approximate the output size (bytes) from a per-resolution bitrate ladder,
 * nudged by how far CRF sits from the format default. Rough on purpose —
 * the real size is shown after encoding.
 */
export function estimateVideoSize(
  settings: VideoSettings,
  meta: VideoMetadata | null,
): number | null {
  if (!meta || meta.duration <= 0) return null;

  const targetHeight = VIDEO_RESOLUTION_HEIGHTS[settings.resolution];
  const effectiveHeight = targetHeight ? Math.min(targetHeight, meta.height || targetHeight) : meta.height || 1080;

  const ladder = VIDEO_BITRATE_LADDER.find((r) => effectiveHeight <= r.maxHeight) ?? VIDEO_BITRATE_LADDER[VIDEO_BITRATE_LADDER.length - 1];

  // ~6 CRF points ≈ a doubling/halving of bitrate for x264-style encoders.
  const { default: defaultCrf } = VIDEO_CRF_RANGE[settings.format];
  const crfMultiplier = Math.pow(2, (defaultCrf - settings.crf) / 6);
  const videoKbps = ladder.kbps * crfMultiplier;

  const audioKbps = settings.audioBitrate === 'mute' ? 0 : Number(settings.audioBitrate);

  const totalBits = (videoKbps + audioKbps) * 1000 * meta.duration;
  return Math.round(totalBits / 8);
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

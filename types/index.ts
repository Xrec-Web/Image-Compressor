export type FileStatus = 'pending' | 'processing' | 'done' | 'error';
export type CompressionMode = 'image' | 'pdf' | 'video';
export type OutputFormat = 'jpg' | 'webp' | 'avif' | 'png';
export type QualityPreset = 'high' | 'balanced' | 'small';
export type MaxDimension = 'original' | '2560' | '1920' | '1280' | '800';

export interface FileItem {
  id: string;
  file: File;
  mode: CompressionMode;
  name: string;
  originalSize: number;
  thumbnail: string; // data URL or blob URL
  status: FileStatus;
  compressedBlob?: Blob;
  compressedSize?: number;
  error?: string;
}

export interface Settings {
  format: OutputFormat;
  quality: QualityPreset;
  maxDimension: MaxDimension;
}

// ── Video ──────────────────────────────────────────────────────────────────
export type VideoFormat = 'mp4' | 'webm';
// 'original' keeps the source height; the rest are target heights (px).
export type VideoResolution = 'original' | '1440' | '1080' | '720' | '480';
export type VideoFps = 'original' | '30' | '24';
// 'mute' strips the audio track entirely.
export type AudioBitrate = 'mute' | '96' | '128' | '192';

export interface VideoSettings {
  format: VideoFormat;
  /** Constant Rate Factor. Lower = better quality / larger file. */
  crf: number;
  resolution: VideoResolution;
  fps: VideoFps;
  audioBitrate: AudioBitrate;
  /** Move the moov atom to the front so the file plays before fully loading (MP4 only). */
  faststart: boolean;
  /** Drop title/comment/etc. metadata tags. */
  stripMetadata: boolean;
}

// CRF ranges differ per encoder. x264 ~18-28 sane; VP9 ~24-40.
export const VIDEO_CRF_RANGE: Record<VideoFormat, { min: number; max: number; default: number }> = {
  mp4: { min: 18, max: 30, default: 23 },
  webm: { min: 24, max: 42, default: 32 },
};

export const VIDEO_RESOLUTION_HEIGHTS: Record<VideoResolution, number | undefined> = {
  original: undefined,
  '1440': 1440,
  '1080': 1080,
  '720': 720,
  '480': 480,
};

export const VIDEO_FORMAT_EXT: Record<VideoFormat, string> = {
  mp4: 'mp4',
  webm: 'webm',
};

export const VIDEO_FORMAT_MIME: Record<VideoFormat, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
};

/**
 * Rough per-resolution video bitrate ladder (kbps) used only to estimate
 * output size in the UI. Real size depends on CRF + content and is shown
 * after encoding. Indexed by the effective output height.
 */
export const VIDEO_BITRATE_LADDER: { maxHeight: number; kbps: number }[] = [
  { maxHeight: 480, kbps: 1200 },
  { maxHeight: 720, kbps: 2500 },
  { maxHeight: 1080, kbps: 5000 },
  { maxHeight: 1440, kbps: 9000 },
  { maxHeight: Infinity, kbps: 16000 },
];

export const QUALITY_VALUES: Record<QualityPreset, number> = {
  high: 85,
  balanced: 75,
  small: 60,
};

export const DIMENSION_VALUES: Record<MaxDimension, number | undefined> = {
  original: undefined,
  '2560': 2560,
  '1920': 1920,
  '1280': 1280,
  '800': 800,
};

export const FORMAT_MIME: Record<OutputFormat, string> = {
  jpg: 'image/jpeg',
  webp: 'image/webp',
  avif: 'image/avif',
  png: 'image/png',
};

export const FORMAT_EXT: Record<OutputFormat, string> = {
  jpg: 'jpg',
  webp: 'webp',
  avif: 'avif',
  png: 'png',
};

export const IMAGE_ACCEPTED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/heic',
  'image/heif',
];

export const PDF_ACCEPTED_MIME_TYPES = ['application/pdf'];

export const VIDEO_ACCEPTED_MIME_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime', // .mov
  'video/x-matroska', // .mkv
  'video/x-msvideo', // .avi
  'video/x-m4v',
  'video/mpeg',
  'video/3gpp',
  'video/ogg',
];

export const VIDEO_ACCEPTED_EXTENSIONS = [
  '.mp4',
  '.webm',
  '.mov',
  '.mkv',
  '.avi',
  '.m4v',
  '.mpeg',
  '.mpg',
  '.3gp',
  '.ogv',
];

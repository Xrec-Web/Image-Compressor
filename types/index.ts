export type FileStatus = 'pending' | 'processing' | 'done' | 'error';
export type OutputFormat = 'jpg' | 'webp' | 'avif';
export type QualityPreset = 'high' | 'balanced' | 'small';
export type MaxDimension = 'original' | '2560' | '1920' | '1280' | '800';

export interface FileItem {
  id: string;
  file: File;
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
};

export const FORMAT_EXT: Record<OutputFormat, string> = {
  jpg: 'jpg',
  webp: 'webp',
  avif: 'avif',
};

export const ACCEPTED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/heic',
  'image/heif',
];

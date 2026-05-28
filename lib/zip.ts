import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import type { FileItem, OutputFormat, VideoFormat } from '@/types';
import { FORMAT_EXT, VIDEO_FORMAT_EXT } from '@/types';
import { getTodayString } from '@/lib/utils';

interface DownloadFormats {
  imageFormat: OutputFormat;
  videoFormat: VideoFormat;
}

/**
 * Download completed files.
 * - 1 file  → direct download with the correct extension, no ZIP wrapper.
 * - 2+ files → bundle into a ZIP with collision-safe filenames.
 */
export async function downloadAsZip(files: FileItem[], formats: DownloadFormats): Promise<void> {
  const done = files.filter((f) => f.status === 'done' && f.compressedBlob);
  const mode = done[0]?.mode ?? 'image';
  const ext =
    mode === 'pdf' ? 'pdf' : mode === 'video' ? VIDEO_FORMAT_EXT[formats.videoFormat] : FORMAT_EXT[formats.imageFormat];

  // ── Single file: skip the ZIP entirely ──────────────────────────────────
  if (done.length === 1) {
    const item = done[0];
    const baseName = item.name.replace(/\.[^.]+$/, '');
    saveAs(item.compressedBlob!, `${baseName}.${ext}`);
    return;
  }

  // ── Multiple files: bundle into ZIP ─────────────────────────────────────
  const zip = new JSZip();
  const usedNames = new Set<string>();

  for (const item of done) {
    const baseName = item.name.replace(/\.[^.]+$/, '');
    let filename = `${baseName}.${ext}`;

    if (usedNames.has(filename)) {
      let i = 1;
      while (usedNames.has(`${baseName}-${i}.${ext}`)) i++;
      filename = `${baseName}-${i}.${ext}`;
    }

    usedNames.add(filename);
    zip.file(filename, item.compressedBlob!);
  }

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 1 } });
  const folderLabel = mode === 'pdf' ? 'pdfs' : mode === 'video' ? 'videos' : 'images';
  saveAs(blob, `compressed-${folderLabel}-${getTodayString()}.zip`);
}

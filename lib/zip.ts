import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import type { FileItem, OutputFormat } from '@/types';
import { FORMAT_EXT } from '@/types';
import { getTodayString } from '@/lib/utils';

/**
 * Download completed files.
 * - 1 file  → direct download with the correct extension, no ZIP wrapper.
 * - 2+ files → bundle into a ZIP with collision-safe filenames.
 */
export async function downloadAsZip(files: FileItem[], format: OutputFormat): Promise<void> {
  const done = files.filter((f) => f.status === 'done' && f.compressedBlob);
  const ext = FORMAT_EXT[format];

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
  saveAs(blob, `compressed-images-${getTodayString()}.zip`);
}

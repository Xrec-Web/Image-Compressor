import type { QualityPreset, MaxDimension } from '@/types';
import { DIMENSION_VALUES, QUALITY_VALUES } from '@/types';

type PdfJsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
type PdfLibModule = typeof import('pdf-lib');

let pdfJsPromise: Promise<PdfJsModule> | null = null;
let pdfLibPromise: Promise<PdfLibModule> | null = null;

function getPdfJs() {
  if (!pdfJsPromise) {
    pdfJsPromise = import('pdfjs-dist/legacy/build/pdf.mjs');
  }
  return pdfJsPromise;
}

function getPdfLib() {
  if (!pdfLibPromise) {
    pdfLibPromise = import('pdf-lib');
  }
  return pdfLibPromise;
}

function ensurePdfWorker(pdfjs: PdfJsModule) {
  if (typeof window === 'undefined') return;
  if (pdfjs.GlobalWorkerOptions.workerPort) return;

  pdfjs.GlobalWorkerOptions.workerPort = new Worker(
    new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url),
    { type: 'module' },
  );
}

async function toUint8Array(source: Blob | ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  if (source instanceof Uint8Array) return source;
  if (source instanceof ArrayBuffer) return new Uint8Array(source);
  return new Uint8Array(await source.arrayBuffer());
}

async function loadPdfDocument(source: Blob | ArrayBuffer | Uint8Array) {
  const pdfjs = await getPdfJs();
  ensurePdfWorker(pdfjs);
  const data = await toUint8Array(source);
  return pdfjs.getDocument({
    data,
    useWorkerFetch: false,
  }).promise;
}

async function renderPdfPageFromDocument(
  pdf: Awaited<ReturnType<typeof loadPdfDocument>>,
  pageNumber: number,
  maxDimension: MaxDimension,
): Promise<{ canvas: HTMLCanvasElement; width: number; height: number }> {
  const page = await pdf.getPage(pageNumber);
  const baseViewport = page.getViewport({ scale: 1 });
  const maxWidth = DIMENSION_VALUES[maxDimension];
  const scale = maxWidth ? Math.min(1, maxWidth / baseViewport.width) : 1;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Failed to create preview canvas');

  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvasContext: context, viewport, canvas }).promise;
  return { canvas, width: canvas.width, height: canvas.height };
}

async function renderPdfPage(
  source: Blob | ArrayBuffer | Uint8Array,
  pageNumber: number,
  maxDimension: MaxDimension,
): Promise<{ canvas: HTMLCanvasElement; width: number; height: number }> {
  const pdf = await loadPdfDocument(source);
  return renderPdfPageFromDocument(pdf, pageNumber, maxDimension);
}

export async function generatePdfThumbnail(file: File): Promise<string> {
  try {
    const { canvas } = await renderPdfPage(file, 1, '800');
    return canvas.toDataURL('image/jpeg', 0.76);
  } catch {
    return '';
  }
}

export async function renderPdfPreview(source: Blob | ArrayBuffer | Uint8Array): Promise<string> {
  const { canvas } = await renderPdfPage(source, 1, '1920');
  return canvas.toDataURL('image/jpeg', 0.88);
}

export async function compressPdfFile(
  file: File,
  opts: { quality: QualityPreset; maxDimension: MaxDimension },
): Promise<Blob> {
  const pdf = await loadPdfDocument(file);
  const { PDFDocument } = await getPdfLib();
  const output = await PDFDocument.create();
  const pageCount = pdf.numPages;
  const jpegQuality = QUALITY_VALUES[opts.quality] / 100;

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const { canvas, width, height } = await renderPdfPageFromDocument(pdf, pageNumber, opts.maxDimension);
    const jpegDataUrl = canvas.toDataURL('image/jpeg', jpegQuality);
    const embedded = await output.embedJpg(jpegDataUrl);
    const page = output.addPage([width, height]);
    page.drawImage(embedded, { x: 0, y: 0, width, height });
  }

  const bytes = await output.save({
    useObjectStreams: true,
    addDefaultPage: false,
  });
  const pdfBytes = Uint8Array.from(bytes);

  return new Blob([pdfBytes], { type: 'application/pdf' });
}

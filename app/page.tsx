'use client';

import { useReducer, useState, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Download, RotateCcw, Zap } from 'lucide-react';

import type { FileItem, Settings, FileStatus } from '@/types';
import { ACCEPTED_MIME_TYPES } from '@/types';
import { compressFile } from '@/lib/compress';
import { downloadAsZip } from '@/lib/zip';
import { generateThumbnail, isHeicFile, cn, formatBytes } from '@/lib/utils';

// ssr: false prevents the style-tag hydration mismatch BorderBeam causes
// (server HTML-entity-encodes its injected CSS; client renders raw chars)
const BorderBeam = dynamic(
  () => import('border-beam').then((m) => m.BorderBeam),
  { ssr: false },
);
import UploadZone from '@/components/upload-zone';
import SettingsPanel from '@/components/settings-panel';
import FileGrid from '@/components/file-grid';
import TextSwap from '@/components/text-swap';
import ProgressBanner from '@/components/progress-banner';
import SummaryBanner from '@/components/summary-banner';

// ── State ──────────────────────────────────────────────────────────────────
type Action =
  | { type: 'ADD_FILES'; files: FileItem[] }
  | { type: 'REMOVE_FILE'; id: string }
  | { type: 'SET_STATUS'; id: string; status: FileStatus }
  | { type: 'SET_RESULT'; id: string; blob: Blob; size: number }
  | { type: 'SET_ERROR'; id: string; error: string }
  | { type: 'CLEAR_ALL' };

function fileReducer(state: FileItem[], action: Action): FileItem[] {
  switch (action.type) {
    case 'ADD_FILES':
      return [...state, ...action.files];
    case 'REMOVE_FILE':
      return state.filter((f) => f.id !== action.id);
    case 'SET_STATUS':
      return state.map((f) => (f.id === action.id ? { ...f, status: action.status } : f));
    case 'SET_RESULT':
      return state.map((f) =>
        f.id === action.id
          ? { ...f, status: 'done', compressedBlob: action.blob, compressedSize: action.size }
          : f,
      );
    case 'SET_ERROR':
      return state.map((f) =>
        f.id === action.id ? { ...f, status: 'error', error: action.error } : f,
      );
    case 'CLEAR_ALL':
      return [];
    default:
      return state;
  }
}

const DEFAULT_SETTINGS: Settings = {
  format: 'webp',
  quality: 'balanced',
  maxDimension: '1920',
};

const SIZE_WARNING_THRESHOLD = 200 * 1024 * 1024; // 200 MB

// ── Component ──────────────────────────────────────────────────────────────
export default function HomePage() {
  const [files, dispatch] = useReducer(fileReducer, []);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentFileId, setCurrentFileId] = useState<string | null>(null);
  const [sizeWarning, setSizeWarning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const stopRef = useRef(false);

  // ── Derived state ────────────────────────────────────────────────────────
  const hasFiles = files.length > 0;
  const pendingFiles = files.filter((f) => f.status === 'pending');
  const doneFiles = files.filter((f) => f.status === 'done');
  const errorFiles = files.filter((f) => f.status === 'error');
  const processedCount = doneFiles.length + errorFiles.length;
  const allFinished = hasFiles && files.every((f) => f.status === 'done' || f.status === 'error');
  const canCompress = pendingFiles.length > 0 && !isProcessing;
  const canDownload = allFinished && doneFiles.length > 0;
  const currentFileName = files.find((f) => f.id === currentFileId)?.name;

  // Beam is active during dragging, compressing, or ready to download
  const beamActive = isDragging || isProcessing || canDownload;

  const totalOriginalSize = doneFiles.reduce((acc, f) => acc + f.originalSize, 0);
  const totalCompressedSize = doneFiles.reduce((acc, f) => acc + (f.compressedSize ?? 0), 0);

  // ── Add files ────────────────────────────────────────────────────────────
  const handleAddFiles = useCallback(
    async (newFiles: File[]) => {
      const accepted = newFiles.filter(
        (f) =>
          ACCEPTED_MIME_TYPES.includes(f.type) ||
          isHeicFile(f),
      );
      if (accepted.length === 0) return;

      // Size warning
      const totalExisting = files.reduce((acc, f) => acc + f.originalSize, 0);
      const totalNew = accepted.reduce((acc, f) => acc + f.size, 0);
      if (totalExisting + totalNew > SIZE_WARNING_THRESHOLD) {
        setSizeWarning(true);
      } else {
        setSizeWarning(false);
      }

      const items: FileItem[] = await Promise.all(
        accepted.map(async (file) => ({
          id: crypto.randomUUID(),
          file,
          name: file.name,
          originalSize: file.size,
          thumbnail: await generateThumbnail(file),
          status: 'pending' as FileStatus,
        })),
      );

      dispatch({ type: 'ADD_FILES', files: items });
    },
    [files],
  );

  // ── Remove / clear ───────────────────────────────────────────────────────
  const handleRemoveFile = useCallback((id: string) => {
    dispatch({ type: 'REMOVE_FILE', id });
  }, []);

  const handleClearAll = useCallback(() => {
    setSizeWarning(false);
    dispatch({ type: 'CLEAR_ALL' });
  }, []);

  // ── Compress ─────────────────────────────────────────────────────────────
  const handleCompress = useCallback(async () => {
    const toProcess = files.filter((f) => f.status === 'pending');
    if (toProcess.length === 0 || isProcessing) return;

    setIsProcessing(true);
    stopRef.current = false;

    for (const item of toProcess) {
      if (stopRef.current) break;

      setCurrentFileId(item.id);
      dispatch({ type: 'SET_STATUS', id: item.id, status: 'processing' });

      try {
        const compressed = await compressFile(item.file, settings);
        dispatch({ type: 'SET_RESULT', id: item.id, blob: compressed, size: compressed.size });
      } catch (err) {
        dispatch({
          type: 'SET_ERROR',
          id: item.id,
          error: err instanceof Error ? err.message : 'Compression failed',
        });
      }
    }

    setIsProcessing(false);
    setCurrentFileId(null);
  }, [files, settings, isProcessing]);

  // ── Download ─────────────────────────────────────────────────────────────
  const handleDownload = useCallback(async () => {
    await downloadAsZip(files, settings.format);
  }, [files, settings.format]);

  return (
    <main className="min-h-screen bg-background pb-20">
      <div className="max-w-[960px] mx-auto px-5 sm:px-8 pt-10">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <motion.header
          className="mb-7"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-foreground flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-background fill-background" />
            </div>
            <span className="text-[14px] font-semibold text-foreground tracking-tight">
              Image Compressor
            </span>
          </div>
        </motion.header>

        {/* ── Settings Panel ───────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.08 }}
        >
          <BorderBeam size="md" colorVariant="colorful" theme="dark" strength={0.3} active={beamActive}>
            <SettingsPanel settings={settings} onChange={setSettings} disabled={isProcessing} />
          </BorderBeam>
        </motion.div>

        {/* ── Size Warning ─────────────────────────────────────────────────── */}
        <AnimatePresence>
          {sizeWarning && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 overflow-hidden"
            >
              <p className="text-[12px] text-amber-300 bg-amber-950/40 border border-amber-800/40 rounded-lg px-3 py-2">
                Total source size exceeds 200 MB — large batches may be slow or run out of browser memory.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Upload zone / File grid ───────────────────────────────────────── */}
        <div className="mt-4">
          {!hasFiles ? (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.14 }}
            >
              <BorderBeam size="md" colorVariant="colorful" theme="dark" active={isDragging}>
                <UploadZone onFiles={handleAddFiles} onDragStateChange={setIsDragging} />
              </BorderBeam>
            </motion.div>
          ) : (
            <div>
              {/* Compact add-more strip */}
              <UploadZone onFiles={handleAddFiles} compact disabled={isProcessing} />

              {/* File grid */}
              <div className="mt-3">
                <FileGrid files={files} onRemove={handleRemoveFile} />
              </div>
            </div>
          )}
        </div>

        {/* ── Progress banner ───────────────────────────────────────────────── */}
        <AnimatePresence>
          {isProcessing && (
            <ProgressBanner
              current={processedCount}
              total={files.length}
              currentFile={currentFileName}
            />
          )}
        </AnimatePresence>

        {/* ── Summary banner ────────────────────────────────────────────────── */}
        <AnimatePresence>
          {canDownload && !isProcessing && (
            <SummaryBanner
              count={doneFiles.length}
              originalSize={totalOriginalSize}
              compressedSize={totalCompressedSize}
            />
          )}
        </AnimatePresence>

        {/* ── Action buttons ────────────────────────────────────────────────── */}
        <AnimatePresence>
          {hasFiles && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="mt-5 flex items-center flex-wrap gap-3"
            >
              {/* Compress — styled off the beam */}
              {!allFinished && (
                <BorderBeam
                  size="sm"
                  colorVariant="colorful"
                  theme="dark"
                  active={canCompress || isProcessing}
                  className="inline-flex"
                >
                  <button
                    onClick={handleCompress}
                    disabled={!canCompress}
                    className={cn(
                      'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold transition-all duration-150',
                      canCompress || isProcessing
                        ? 'bg-card text-foreground active:scale-[0.98]'
                        : 'bg-foreground/[0.04] text-muted cursor-not-allowed',
                    )}
                  >
                    {isProcessing && (
                      <span className="w-3.5 h-3.5 border-2 border-foreground/20 border-t-foreground/70 rounded-full animate-spin flex-shrink-0" />
                    )}
                    <TextSwap
                      text={
                        isProcessing
                          ? 'Compressing…'
                          : `Compress ${pendingFiles.length} ${pendingFiles.length === 1 ? 'image' : 'images'}`
                      }
                    />
                  </button>
                </BorderBeam>
              )}

              {/* Download — single file or ZIP */}
              {canDownload && (
                <button
                  onClick={handleDownload}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold bg-foreground text-background hover:bg-foreground/85 active:scale-[0.98] transition-all duration-150"
                >
                  <Download className="w-3.5 h-3.5" />
                  {doneFiles.length === 1 ? 'Download image' : 'Download ZIP'}
                  <span className="font-mono text-[11px] opacity-60 ml-0.5">
                    ({formatBytes(totalCompressedSize)})
                  </span>
                </button>
              )}

              {/* Clear all */}
              <button
                onClick={handleClearAll}
                disabled={isProcessing}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] text-muted transition-colors',
                  'hover:text-foreground hover:bg-foreground/5',
                  isProcessing && 'pointer-events-none opacity-40',
                )}
              >
                <RotateCcw className="w-3 h-3" />
                Clear all
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Footer ────────────────────────────────────────────────────────── */}
        <motion.footer
          className="mt-12 flex items-center gap-1.5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.5 }}
        >
          <Lock className="w-3 h-3 text-muted" />
          <span className="text-[12px] text-muted">Files never leave your browser</span>
        </motion.footer>
      </div>
    </main>
  );
}

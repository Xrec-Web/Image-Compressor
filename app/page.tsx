'use client';

import { useReducer, useState, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Download, RotateCcw, ImageIcon, FileText } from 'lucide-react';

import type { CompressionMode, FileItem, Settings, FileStatus } from '@/types';
import { IMAGE_ACCEPTED_MIME_TYPES } from '@/types';
import { compressFile } from '@/lib/compress';
import { downloadAsZip } from '@/lib/zip';
import { generateThumbnail, isHeicFile, isPdfFile, cn, formatBytes } from '@/lib/utils';

// ssr: false prevents the style-tag hydration mismatch BorderBeam causes
// (server HTML-entity-encodes its injected CSS; client renders raw chars)
const BorderBeam = dynamic(
  () => import('border-beam').then((m) => m.BorderBeam),
  { ssr: false },
);
import UploadZone from '@/components/upload-zone';
import SettingsPanel from '@/components/settings-panel';
import FileGrid from '@/components/file-grid';
import InlinePreview from '@/components/inline-preview';
import GlobalDropOverlay from '@/components/global-drop-overlay';
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
const MODE_COPY: Record<CompressionMode, { title: string; noun: string }> = {
  image: {
    title: 'Image Compressor',
    noun: 'image',
  },
  pdf: {
    title: 'PDF Compressor',
    noun: 'PDF',
  },
};

// ── Component ──────────────────────────────────────────────────────────────
export default function HomePage() {
  const [files, dispatch] = useReducer(fileReducer, []);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [mode, setMode] = useState<CompressionMode>('image');
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentFileId, setCurrentFileId] = useState<string | null>(null);
  const [sizeWarning, setSizeWarning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [btnHover, setBtnHover] = useState(false);
  const [modeHover, setModeHover] = useState<CompressionMode | null>(null);
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
  const modeCopy = MODE_COPY[mode];
  const isPdfMode = mode === 'pdf';

  // Beam is active during dragging, compressing, or ready to download
  const beamActive = isDragging || isProcessing || canDownload;

  const totalOriginalSize = doneFiles.reduce((acc, f) => acc + f.originalSize, 0);
  const totalCompressedSize = doneFiles.reduce((acc, f) => acc + (f.compressedSize ?? 0), 0);

  const handleModeChange = useCallback((nextMode: CompressionMode) => {
    if (nextMode === mode || isProcessing) return;
    setMode(nextMode);
    setSizeWarning(false);
    dispatch({ type: 'CLEAR_ALL' });
  }, [isProcessing, mode]);

  // ── Add files ────────────────────────────────────────────────────────────
  const handleAddFiles = useCallback(
    async (newFiles: File[]) => {
      const accepted = newFiles.filter(
        (f) =>
          mode === 'pdf'
            ? isPdfFile(f)
            : IMAGE_ACCEPTED_MIME_TYPES.includes(f.type) || isHeicFile(f),
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
          mode,
          name: file.name,
          originalSize: file.size,
          thumbnail: mode === 'image' ? await generateThumbnail(file) : '',
          status: 'pending' as FileStatus,
        })),
      );

      dispatch({ type: 'ADD_FILES', files: items });
    },
    [files, mode],
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
    if (mode === 'pdf') return;
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
  }, [files, settings, isProcessing, mode]);

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
          <div className="flex flex-wrap items-center gap-2.5">
            {([
              { value: 'image', label: 'Image Compressor', icon: ImageIcon },
              { value: 'pdf', label: 'PDF Compressor', icon: FileText },
            ] as const).map((option) => {
              const active = mode === option.value;
              const Icon = option.icon;
              return (
                <BorderBeam
                  key={option.value}
                  size="line"
                  colorVariant="mono"
                  theme="dark"
                  active={active || modeHover === option.value}
                  className="inline-flex"
                >
                  <button
                    type="button"
                    onClick={() => handleModeChange(option.value)}
                    onMouseEnter={() => setModeHover(option.value)}
                    onMouseLeave={() => setModeHover(null)}
                    disabled={isProcessing}
                    className={cn(
                      'inline-flex items-center gap-2.5 rounded-xl px-3 py-2 transition-colors duration-200',
                      active
                        ? 'bg-card text-foreground'
                        : 'text-muted hover:text-foreground hover:bg-card/70',
                      isProcessing && 'pointer-events-none opacity-50',
                    )}
                  >
                    <div
                      className={cn(
                        'w-7 h-7 rounded-lg flex items-center justify-center transition-colors',
                        active ? 'bg-foreground text-background' : 'bg-foreground/8 text-foreground',
                      )}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-[14px] font-semibold tracking-tight">
                      {option.label}
                    </span>
                  </button>
                </BorderBeam>
              );
            })}
          </div>
        </motion.header>

        {/* ── Settings Panel ───────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.08 }}
        >
          <BorderBeam size="md" colorVariant="colorful" theme="dark" strength={0.3} active={beamActive}>
            <SettingsPanel
              mode={mode}
              settings={settings}
              onChange={setSettings}
              disabled={isProcessing || isPdfMode}
            />
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
                <UploadZone mode={mode} onFiles={handleAddFiles} onDragStateChange={setIsDragging} />
              </BorderBeam>
            </motion.div>
          ) : (
            <div>
              {mode === 'image' && (
                <>
                  {/* Before/after comparison — always shows the first file as the reference.
                      key forces a remount (and fresh compression) if the first file changes. */}
                  <InlinePreview
                    key={files[0].id}
                    file={files[0]}
                    settings={settings}
                  />
                </>
              )}

              {/* Compact add-more strip */}
              <UploadZone mode={mode} onFiles={handleAddFiles} compact disabled={isProcessing} />

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
              label={`Compressing ${modeCopy.noun.toLowerCase()}s…`}
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
              itemLabel={modeCopy.noun.toLowerCase()}
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
              {/* Compress — white at rest, dark + beam on hover / processing */}
              {!allFinished && (
                <BorderBeam
                  size="sm"
                  colorVariant="colorful"
                  theme="dark"
                  active={!isPdfMode && ((btnHover && canCompress) || isProcessing)}
                  className="inline-flex"
                >
                  <button
                    onClick={handleCompress}
                    disabled={!canCompress || isPdfMode}
                    onMouseEnter={() => setBtnHover(true)}
                    onMouseLeave={() => setBtnHover(false)}
                    className={cn(
                      'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold transition-all duration-200',
                      isPdfMode
                        ? 'bg-foreground/[0.04] text-muted cursor-not-allowed'
                        : isProcessing
                        ? 'bg-card text-foreground'
                        : canCompress
                          ? (btnHover
                            ? 'bg-card text-foreground active:scale-[0.98]'
                            : 'bg-white text-[#111111] active:scale-[0.98]')
                          : 'bg-foreground/[0.04] text-muted cursor-not-allowed',
                    )}
                  >
                    {isProcessing && (
                      <span className="w-3.5 h-3.5 border-2 border-foreground/20 border-t-foreground/70 rounded-full animate-spin flex-shrink-0" />
                    )}
                    <TextSwap
                      text={
                        isPdfMode
                          ? 'PDF compression coming soon'
                          : isProcessing
                          ? 'Compressing…'
                          : `Compress ${pendingFiles.length} ${pendingFiles.length === 1 ? modeCopy.noun : `${modeCopy.noun}s`}`
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

        <AnimatePresence>
          {mode === 'pdf' && hasFiles && (
            <motion.p
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="mt-3 text-[12px] text-muted"
            >
              PDF mode now swaps the full workspace context, file targeting, and iconography. The
              document compression engine is the next piece to wire up.
            </motion.p>
          )}
        </AnimatePresence>

        {/* ── Global drop overlay ───────────────────────────────────────────── */}
        <GlobalDropOverlay onFiles={handleAddFiles} />

        {/* ── Footer ────────────────────────────────────────────────────────── */}
        <motion.footer
          className="mt-12 flex items-center gap-1.5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.5 }}
        >
          <Lock className="w-3 h-3 text-muted" />
          <span className="text-[12px] text-muted">
            {modeCopy.title} keeps your files in the browser
          </span>
        </motion.footer>
      </div>
    </main>
  );
}

'use client';

import { useReducer, useState, useCallback, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Download, RotateCcw, ImageIcon, FileText, Video } from 'lucide-react';

import type { CompressionMode, FileItem, Settings, VideoSettings, FileStatus } from '@/types';
import { IMAGE_ACCEPTED_MIME_TYPES, VIDEO_CRF_RANGE } from '@/types';
import { compressFile } from '@/lib/compress';
import { generatePdfThumbnail } from '@/lib/pdf';
import { compressVideo, preloadFFmpeg, canUseMultiThread } from '@/lib/video';
import { downloadAsZip } from '@/lib/zip';
import {
  generateThumbnail,
  generateVideoThumbnail,
  isHeicFile,
  isPdfFile,
  isVideoFile,
  cn,
  formatBytes,
} from '@/lib/utils';

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
import VideoSettingsPanel from '@/components/video-settings-panel';
import VideoPreview from '@/components/video-preview';
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

const DEFAULT_VIDEO_SETTINGS: VideoSettings = {
  format: 'mp4',
  crf: VIDEO_CRF_RANGE.mp4.default,
  resolution: '1080',
  fps: 'original',
  audioBitrate: '128',
  faststart: true,
  stripMetadata: false,
};

const SIZE_WARNING_THRESHOLD = 200 * 1024 * 1024; // 200 MB

// Maps each mode to its slide-page index for the side-by-side transition.
const MODE_PAGE: Record<CompressionMode, string> = { image: '1', pdf: '2', video: '3' };

const MODE_COPY: Record<CompressionMode, { title: string; noun: string }> = {
  image: {
    title: 'Image Compressor',
    noun: 'image',
  },
  pdf: {
    title: 'PDF Compressor',
    noun: 'PDF',
  },
  video: {
    title: 'Video Compressor',
    noun: 'video',
  },
};

// ── Component ──────────────────────────────────────────────────────────────
export default function HomePage() {
  const [files, dispatch] = useReducer(fileReducer, []);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [videoSettings, setVideoSettings] = useState<VideoSettings>(DEFAULT_VIDEO_SETTINGS);
  const [mode, setMode] = useState<CompressionMode>('image');
  const [isProcessing, setIsProcessing] = useState(false);
  // True while dropped files are being read and previews generated (pre-compress).
  const [isIngesting, setIsIngesting] = useState(false);
  const [currentFileId, setCurrentFileId] = useState<string | null>(null);
  const [videoProgress, setVideoProgress] = useState(0);
  const [sizeWarning, setSizeWarning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [btnHover, setBtnHover] = useState(false);
  const [modeHover, setModeHover] = useState<CompressionMode | null>(null);
  const [modePanelHeight, setModePanelHeight] = useState<number | null>(null);
  // null until checked client-side (avoids SSR hydration mismatch).
  const [multiThread, setMultiThread] = useState<boolean | null>(null);
  const stopRef = useRef(false);
  const imagePageRef = useRef<HTMLDivElement>(null);
  const pdfPageRef = useRef<HTMLDivElement>(null);
  const videoPageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMultiThread(canUseMultiThread());
  }, []);

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

  // Beam is active during dragging, reading files, compressing, or ready to download
  const beamActive = isDragging || isIngesting || isProcessing || canDownload;

  const totalOriginalSize = doneFiles.reduce((acc, f) => acc + f.originalSize, 0);
  const totalCompressedSize = doneFiles.reduce((acc, f) => acc + (f.compressedSize ?? 0), 0);

  useEffect(() => {
    const activeRef = mode === 'image' ? imagePageRef : mode === 'pdf' ? pdfPageRef : videoPageRef;
    const element = activeRef.current;
    if (!element) return;

    const updateHeight = () => setModePanelHeight(element.offsetHeight);
    updateHeight();

    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);
    return () => observer.disconnect();
  }, [
    mode,
    hasFiles,
    files.length,
    sizeWarning,
    isIngesting,
    isProcessing,
    canDownload,
    allFinished,
    pendingFiles.length,
    processedCount,
    settings,
    videoSettings,
  ]);

  const renderModeBody = (pageMode: CompressionMode) => {
    const isVideo = pageMode === 'video';
    const sizeWarningLabel = isVideo
      ? 'Total source size exceeds 200 MB — in-browser video encoding may be slow or run out of memory.'
      : 'Total source size exceeds 200 MB — large batches may be slow or run out of browser memory.';

    return (
    <>
      <BorderBeam size="md" colorVariant="colorful" theme="dark" strength={0.3} active={pageMode === mode && beamActive}>
        {isVideo ? (
          <VideoSettingsPanel
            settings={videoSettings}
            onChange={setVideoSettings}
            disabled={isProcessing || pageMode !== mode}
          />
        ) : (
          <SettingsPanel
            mode={pageMode}
            settings={settings}
            onChange={setSettings}
            disabled={isProcessing || pageMode !== mode}
          />
        )}
      </BorderBeam>

      <AnimatePresence>
        {sizeWarning && pageMode === mode && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 overflow-hidden"
          >
            <p className="text-[12px] text-amber-300 bg-amber-950/40 border border-amber-800/40 rounded-lg px-3 py-2">
              {sizeWarningLabel}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {isVideo && pageMode === mode && multiThread === false && (
        <p className="mt-3 text-[12px] text-amber-300 bg-amber-950/40 border border-amber-800/40 rounded-lg px-3 py-2">
          Multi-threading is off, so video encoding runs single-threaded and can be very slow
          (minutes for large or 4K clips). It still works — progress is shown below as it runs.
        </p>
      )}

      <div className="mt-4">
        {!hasFiles ? (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.14 }}
          >
            <BorderBeam size="md" colorVariant="colorful" theme="dark" active={pageMode === mode && (isDragging || isIngesting)}>
              <UploadZone
                mode={pageMode}
                onFiles={handleAddFiles}
                onDragStateChange={pageMode === mode ? setIsDragging : undefined}
                loading={pageMode === mode && isIngesting}
                disabled={pageMode !== mode}
              />
            </BorderBeam>
          </motion.div>
        ) : (
          <div>
            {isVideo ? (
              <VideoPreview
                key={`${pageMode}-${files[0].id}`}
                file={files[0]}
                settings={videoSettings}
              />
            ) : (
              <InlinePreview
                key={`${pageMode}-${files[0].id}`}
                file={files[0]}
                settings={settings}
              />
            )}

            <UploadZone
              mode={pageMode}
              onFiles={handleAddFiles}
              compact
              loading={pageMode === mode && isIngesting}
              disabled={isProcessing || pageMode !== mode}
            />

            <div className="mt-3">
              <FileGrid files={files} onRemove={handleRemoveFile} />
            </div>
          </div>
        )}
      </div>
    </>
    );
  };

  const handleModeChange = useCallback((nextMode: CompressionMode) => {
    if (nextMode === mode || isProcessing) return;
    setMode(nextMode);
    setSizeWarning(false);
    dispatch({ type: 'CLEAR_ALL' });
  }, [isProcessing, mode]);

  // ── Add files ────────────────────────────────────────────────────────────
  const handleAddFiles = useCallback(
    async (newFiles: File[]) => {
      const accepted = newFiles.filter((f) =>
        mode === 'pdf'
          ? isPdfFile(f)
          : mode === 'video'
            ? isVideoFile(f)
            : IMAGE_ACCEPTED_MIME_TYPES.includes(f.type) || isHeicFile(f),
      );
      if (accepted.length === 0) return;

      // Start warming the ~31 MB ffmpeg.wasm engine the moment a video is queued.
      if (mode === 'video') preloadFFmpeg();

      // Size warning
      const totalExisting = files.reduce((acc, f) => acc + f.originalSize, 0);
      const totalNew = accepted.reduce((acc, f) => acc + f.size, 0);
      if (totalExisting + totalNew > SIZE_WARNING_THRESHOLD) {
        setSizeWarning(true);
      } else {
        setSizeWarning(false);
      }

      setIsIngesting(true);
      try {
        const items: FileItem[] = await Promise.all(
          accepted.map(async (file) => ({
            id: crypto.randomUUID(),
            file,
            mode,
            name: file.name,
            originalSize: file.size,
            thumbnail:
              mode === 'image'
                ? await generateThumbnail(file)
                : mode === 'pdf'
                  ? await generatePdfThumbnail(file)
                  : await generateVideoThumbnail(file),
            status: 'pending' as FileStatus,
          })),
        );

        dispatch({ type: 'ADD_FILES', files: items });
      } finally {
        setIsIngesting(false);
      }
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
    const toProcess = files.filter((f) => f.status === 'pending');
    if (toProcess.length === 0 || isProcessing) return;

    setIsProcessing(true);
    stopRef.current = false;

    for (const item of toProcess) {
      if (stopRef.current) break;

      setCurrentFileId(item.id);
      setVideoProgress(0);
      dispatch({ type: 'SET_STATUS', id: item.id, status: 'processing' });

      try {
        const compressed =
          item.mode === 'video'
            ? await compressVideo(item.file, videoSettings, setVideoProgress)
            : await compressFile(item.file, settings);
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
    setVideoProgress(0);
  }, [files, settings, videoSettings, isProcessing]);

  // ── Download ─────────────────────────────────────────────────────────────
  const handleDownload = useCallback(async () => {
    await downloadAsZip(files, { imageFormat: settings.format, videoFormat: videoSettings.format });
  }, [files, settings.format, videoSettings.format]);

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
              { value: 'video', label: 'Video Compressor', icon: Video },
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

        {/* ── Mode Workspace ──────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.08 }}
        >
          <div
            className="t-page-slide"
            data-page={MODE_PAGE[mode]}
            style={{
              height: modePanelHeight ?? undefined,
              transition: 'height var(--page-slide-dur) var(--page-slide-ease)',
            }}
          >
            <section className="t-page" data-page-id="1">
              <div ref={imagePageRef}>
                {renderModeBody('image')}
              </div>
            </section>
            <section className="t-page" data-page-id="2">
              <div ref={pdfPageRef}>
                {renderModeBody('pdf')}
              </div>
            </section>
            <section className="t-page" data-page-id="3">
              <div ref={videoPageRef}>
                {renderModeBody('video')}
              </div>
            </section>
          </div>
        </motion.div>

        {/* ── Progress banner ───────────────────────────────────────────────── */}
        <AnimatePresence>
          {isProcessing && (
            <ProgressBanner
              current={processedCount}
              total={files.length}
              currentFile={currentFileName}
              label={`Compressing ${modeCopy.noun.toLowerCase()}s…`}
              subProgress={mode === 'video' ? videoProgress : undefined}
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
                  active={(btnHover && canCompress) || isProcessing}
                  className="inline-flex"
                >
                  <button
                    onClick={handleCompress}
                    disabled={!canCompress}
                    onMouseEnter={() => setBtnHover(true)}
                    onMouseLeave={() => setBtnHover(false)}
                    className={cn(
                      'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold transition-all duration-200',
                      isProcessing
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
                        isProcessing
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
                  {doneFiles.length === 1 ? `Download ${modeCopy.noun}` : 'Download ZIP'}
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

        {/* ── Global drop overlay ───────────────────────────────────────────── */}
        <GlobalDropOverlay onFiles={handleAddFiles} mode={mode} />

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

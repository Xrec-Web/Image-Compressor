'use client';

import { useRef, useState, useCallback, DragEvent, ChangeEvent } from 'react';
import { motion } from 'framer-motion';
import { Upload, Plus, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CompressionMode } from '@/types';
import {
  IMAGE_ACCEPTED_MIME_TYPES,
  PDF_ACCEPTED_MIME_TYPES,
  VIDEO_ACCEPTED_MIME_TYPES,
  VIDEO_ACCEPTED_EXTENSIONS,
} from '@/types';

interface UploadZoneProps {
  onFiles: (files: File[]) => void;
  onDragStateChange?: (isDragging: boolean) => void;
  compact?: boolean;
  disabled?: boolean;
  /** Files are being read / previews generated — show a loading state. */
  loading?: boolean;
  mode?: CompressionMode;
}

export default function UploadZone({
  onFiles,
  onDragStateChange,
  compact = false,
  disabled = false,
  loading = false,
  mode = 'image',
}: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const acceptString =
    mode === 'pdf'
      ? PDF_ACCEPTED_MIME_TYPES.join(',') + ',.pdf'
      : mode === 'video'
        ? VIDEO_ACCEPTED_MIME_TYPES.join(',') + ',' + VIDEO_ACCEPTED_EXTENSIONS.join(',')
        : IMAGE_ACCEPTED_MIME_TYPES.join(',') + ',.heic,.heif';

  const setDrag = useCallback((val: boolean) => {
    setIsDraggingOver(val);
    onDragStateChange?.(val);
  }, [onDragStateChange]);

  const inert = disabled || loading;

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDrag(false);
      if (inert) return;

      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) onFiles(files);
    },
    [onFiles, inert, setDrag],
  );

  const handleDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (!inert) setDrag(true);
    },
    [inert, setDrag],
  );

  const handleDragLeave = useCallback(() => {
    setDrag(false);
  }, [setDrag]);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length > 0) onFiles(files);
      // Reset so the same files can be re-selected
      e.target.value = '';
    },
    [onFiles],
  );

  const handleClick = useCallback(() => {
    if (!inert) inputRef.current?.click();
  }, [inert]);

  if (compact) {
    return (
      <div
        role="button"
        tabIndex={inert ? -1 : 0}
        onClick={handleClick}
        onKeyDown={(e) => e.key === 'Enter' && handleClick()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        data-drop-zone
        className={cn(
          'flex items-center justify-center gap-2 w-full py-2.5 rounded-lg border border-dashed text-sm transition-colors',
          loading
            ? 'border-accent/50 text-accent cursor-wait'
            : isDraggingOver
              ? 'border-accent text-accent bg-accent/[0.08] cursor-pointer'
              : 'border-border text-muted hover:border-foreground/30 hover:text-foreground/70 cursor-pointer',
          disabled && !loading && 'pointer-events-none opacity-40',
        )}
      >
        {loading ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Reading files…</span>
          </>
        ) : (
          <>
            <Plus className="w-3.5 h-3.5" />
            <span>Add more files</span>
          </>
        )}
        <input ref={inputRef} type="file" accept={acceptString} multiple className="sr-only" onChange={handleChange} />
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={handleClick}
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      data-drop-zone
      className={cn(
        'relative flex flex-col items-center justify-center w-full rounded-xl border border-dashed transition-all duration-200 select-none',
        'min-h-[320px] px-8 py-14',
        loading
          ? 'border-accent/50 bg-accent/[0.04] cursor-wait'
          : isDraggingOver
            ? 'border-accent bg-accent/[0.07] scale-[1.005] cursor-pointer'
            : 'border-border bg-card hover:border-foreground/25 hover:bg-card cursor-pointer',
        disabled && !loading && 'pointer-events-none opacity-40',
      )}
    >
      <input ref={inputRef} type="file" accept={acceptString} multiple className="sr-only" onChange={handleChange} />

      {/* Icon */}
      <motion.div
        animate={isDraggingOver && !loading ? { scale: 1.1, y: -4 } : { scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 20 }}
        className={cn(
          'w-12 h-12 rounded-xl flex items-center justify-center mb-5 transition-colors',
          loading
            ? 'bg-accent text-white'
            : isDraggingOver
              ? 'bg-accent text-white'
              : 'bg-foreground/5 text-muted',
        )}
      >
        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
      </motion.div>

      {/* Copy */}
      <p className="text-[15px] font-medium text-foreground tracking-tight mb-1.5">
        {loading
          ? mode === 'video'
            ? 'Reading videos & building previews…'
            : 'Reading files & building previews…'
          : isDraggingOver
            ? 'Drop to add'
            : mode === 'pdf'
              ? 'Drop some PDFs.'
              : mode === 'video'
                ? 'Drop some videos.'
                : 'Drop some images.'}
      </p>
      {loading ? (
        <p className="text-sm text-muted text-center leading-relaxed">
          Hang tight — this stays on your device.
        </p>
      ) : (
        <p className="text-sm text-muted text-center leading-relaxed">
          or{' '}
          <span className="underline underline-offset-2 decoration-muted/60 hover:text-foreground transition-colors">
            click to browse
          </span>
          {' · '}
          {mode === 'pdf' ? 'PDF' : mode === 'video' ? 'MP4, WebM, MOV, MKV, AVI' : 'JPG, PNG, WebP, AVIF, HEIC'}
        </p>
      )}
    </div>
  );
}

'use client';

import { useRef, useState, useCallback, DragEvent, ChangeEvent } from 'react';
import { motion } from 'framer-motion';
import { Upload, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CompressionMode } from '@/types';
import { IMAGE_ACCEPTED_MIME_TYPES, PDF_ACCEPTED_MIME_TYPES } from '@/types';

interface UploadZoneProps {
  onFiles: (files: File[]) => void;
  onDragStateChange?: (isDragging: boolean) => void;
  compact?: boolean;
  disabled?: boolean;
  mode?: CompressionMode;
}

export default function UploadZone({
  onFiles,
  onDragStateChange,
  compact = false,
  disabled = false,
  mode = 'image',
}: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const acceptString =
    mode === 'pdf'
      ? PDF_ACCEPTED_MIME_TYPES.join(',') + ',.pdf'
      : IMAGE_ACCEPTED_MIME_TYPES.join(',') + ',.heic,.heif';

  const setDrag = useCallback((val: boolean) => {
    setIsDraggingOver(val);
    onDragStateChange?.(val);
  }, [onDragStateChange]);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDrag(false);
      if (disabled) return;

      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) onFiles(files);
    },
    [onFiles, disabled, setDrag],
  );

  const handleDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (!disabled) setDrag(true);
    },
    [disabled, setDrag],
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
    if (!disabled) inputRef.current?.click();
  }, [disabled]);

  if (compact) {
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
          'flex items-center justify-center gap-2 w-full py-2.5 rounded-lg border border-dashed text-sm text-muted transition-colors cursor-pointer',
          isDraggingOver
            ? 'border-accent text-accent bg-accent/[0.08]'
            : 'border-border hover:border-foreground/30 hover:text-foreground/70',
          disabled && 'pointer-events-none opacity-40',
        )}
      >
        <Plus className="w-3.5 h-3.5" />
        <span>Add more files</span>
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
        'relative flex flex-col items-center justify-center w-full rounded-xl border border-dashed transition-all duration-200 cursor-pointer select-none',
        'min-h-[320px] px-8 py-14',
        isDraggingOver
          ? 'border-accent bg-accent/[0.07] scale-[1.005]'
          : 'border-border bg-card hover:border-foreground/25 hover:bg-card',
        disabled && 'pointer-events-none opacity-40',
      )}
    >
      <input ref={inputRef} type="file" accept={acceptString} multiple className="sr-only" onChange={handleChange} />

      {/* Icon */}
      <motion.div
        animate={isDraggingOver ? { scale: 1.1, y: -4 } : { scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 20 }}
        className={cn(
          'w-12 h-12 rounded-xl flex items-center justify-center mb-5 transition-colors',
          isDraggingOver ? 'bg-accent text-white' : 'bg-foreground/5 text-muted',
        )}
      >
        <Upload className="w-5 h-5" />
      </motion.div>

      {/* Copy */}
      <p className="text-[15px] font-medium text-foreground tracking-tight mb-1.5">
        {isDraggingOver ? 'Drop to add' : mode === 'pdf' ? 'Drop some PDFs.' : 'Drop some images.'}
      </p>
      <p className="text-sm text-muted text-center leading-relaxed">
        or{' '}
        <span className="underline underline-offset-2 decoration-muted/60 hover:text-foreground transition-colors">
          click to browse
        </span>
        {' · '}
        {mode === 'pdf' ? 'PDF' : 'JPG, PNG, WebP, AVIF, HEIC'}
      </p>
    </div>
  );
}

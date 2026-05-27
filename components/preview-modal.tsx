'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { compressFile } from '@/lib/compress';
import { formatBytes, isHeicFile } from '@/lib/utils';
import type { FileItem, Settings } from '@/types';
import ComparisonSlider from '@/components/comparison-slider';

interface PreviewModalProps {
  file: FileItem;
  settings: Settings;
  onClose: () => void;
}

export default function PreviewModal({ file, settings, onClose }: PreviewModalProps) {
  // The "before" URL — full-quality original (or thumbnail for HEIC)
  const [beforeUrl] = useState<string>(() =>
    isHeicFile(file.file) ? file.thumbnail : URL.createObjectURL(file.file),
  );

  const [afterUrl, setAfterUrl] = useState<string | null>(null);
  const [compressedSize, setCompressedSize] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Generation counter to discard stale compressions
  const genRef = useRef(0);
  const afterUrlRef = useRef<string | null>(null);

  const runCompress = useCallback(async (s: Settings) => {
    const gen = ++genRef.current;
    setIsLoading(true);

    try {
      const blob = await compressFile(file.file, s);
      if (genRef.current !== gen) return; // stale — a newer run started

      // Revoke the previous blob URL to free memory
      if (afterUrlRef.current) URL.revokeObjectURL(afterUrlRef.current);
      const url = URL.createObjectURL(blob);
      afterUrlRef.current = url;
      setAfterUrl(url);
      setCompressedSize(blob.size);
    } catch {
      if (genRef.current !== gen) return;
    } finally {
      if (genRef.current === gen) setIsLoading(false);
    }
  }, [file.file]);

  // Initial compression on mount
  useEffect(() => {
    runCompress(settings);
    return () => {
      // Cleanup on unmount
      if (!isHeicFile(file.file)) URL.revokeObjectURL(beforeUrl);
      if (afterUrlRef.current) URL.revokeObjectURL(afterUrlRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-compress with debounce when settings change
  useEffect(() => {
    const t = setTimeout(() => runCompress(settings), 350);
    return () => clearTimeout(t);
  }, [settings, runCompress]); // eslint-disable-line react-hooks/exhaustive-deps
  // (the initial run is handled separately above to avoid double-firing on mount)

  // Close on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const reduction =
    compressedSize != null
      ? Math.round(((file.originalSize - compressedSize) / file.originalSize) * 100)
      : null;

  const afterLabel = `${settings.format.toUpperCase()} · ${settings.quality}`;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[9950] flex items-center justify-center p-4"
        style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        {/* Backdrop blur */}
        <div className="absolute inset-0 backdrop-blur-sm" />

        <motion.div
          className="relative z-10 w-full max-w-2xl bg-card rounded-2xl border border-border overflow-hidden"
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-foreground truncate">{file.name}</p>
              <p className="font-mono text-[11px] text-muted mt-0.5">
                {formatBytes(file.originalSize)}
                {compressedSize != null && !isLoading && (
                  <>
                    <span className="mx-1.5 opacity-40">→</span>
                    <span className="text-foreground">{formatBytes(compressedSize)}</span>
                    {reduction != null && reduction > 0 && (
                      <span className="ml-1.5 text-success">−{reduction}%</span>
                    )}
                  </>
                )}
              </p>
            </div>
            <button
              onClick={onClose}
              className="ml-3 flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-muted hover:text-foreground hover:bg-foreground/5 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Slider */}
          <div className="p-3">
            <ComparisonSlider
              before={beforeUrl}
              after={afterUrl}
              isLoading={isLoading}
              beforeLabel="Original"
              afterLabel={afterLabel}
              beforeSize={formatBytes(file.originalSize)}
              afterSize={compressedSize != null ? formatBytes(compressedSize) : undefined}
              reduction={reduction}
            />
          </div>

          {/* Footer hint */}
          <p className="text-[11px] text-muted text-center pb-3 -mt-1">
            Drag the handle · Settings update the preview live
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

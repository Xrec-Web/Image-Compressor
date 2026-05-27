'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Eye, CheckCircle2, AlertCircle, Loader2, ImageIcon } from 'lucide-react';
import { cn, formatBytes, formatReduction } from '@/lib/utils';
import type { FileItem } from '@/types';

interface FileCardProps {
  item: FileItem;
  onRemove: (id: string) => void;
  onPreview: (id: string) => void;
  index: number;
}

export default function FileCard({ item, onRemove, onPreview, index }: FileCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  const reduction =
    item.status === 'done' && item.compressedSize !== undefined
      ? Math.round(((item.originalSize - item.compressedSize) / item.originalSize) * 100)
      : null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
      transition={{
        type: 'spring',
        stiffness: 340,
        damping: 28,
        delay: index * 0.04,
      }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      className={cn(
        'relative flex items-center gap-3 p-3 rounded-xl border bg-card transition-shadow duration-150',
        'border-border',
        item.status === 'processing' && 'border-accent/30 bg-accent/[0.06]',
        item.status === 'done' && 'border-success/20',
        item.status === 'error' && 'border-danger/20',
        isHovered ? 'shadow-card-hover' : 'shadow-card',
      )}
    >
      {/* Thumbnail */}
      <div className="relative w-14 h-14 flex-shrink-0 rounded-lg overflow-hidden bg-foreground/5">
        {item.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.thumbnail}
            alt={item.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="w-5 h-5 text-muted" />
          </div>
        )}

        {/* Processing shimmer overlay */}
        {item.status === 'processing' && (
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
            animate={{ x: ['-100%', '100%'] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
      </div>

      {/* File info */}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-foreground truncate leading-snug" title={item.name}>
          {item.name}
        </p>

        <div className="mt-0.5 flex items-center gap-2 flex-wrap">
          {/* Original size — always shown */}
          <span className="font-mono text-[11px] text-muted">
            {formatBytes(item.originalSize)}
          </span>

          {/* Result */}
          <AnimatePresence mode="wait">
            {item.status === 'done' && item.compressedSize !== undefined && (
              <motion.div
                key="done"
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-1.5"
              >
                <span className="text-muted text-[11px]">→</span>
                <span className="font-mono text-[11px] text-foreground font-medium">
                  {formatBytes(item.compressedSize)}
                </span>
                {reduction !== null && (
                  <span
                    className={cn(
                      'font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
                      reduction > 0
                        ? 'text-success bg-success/10'
                        : 'text-muted bg-foreground/5',
                    )}
                  >
                    −{reduction}%
                  </span>
                )}
              </motion.div>
            )}

            {item.status === 'error' && (
              <motion.span
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-[11px] text-danger truncate max-w-[180px]"
                title={item.error}
              >
                {item.error ?? 'Compression failed'}
              </motion.span>
            )}

            {item.status === 'processing' && (
              <motion.span
                key="processing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-[11px] text-accent"
              >
                Compressing…
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Status icon */}
      <div className="flex-shrink-0 w-6 flex items-center justify-center">
        <AnimatePresence mode="wait">
          {item.status === 'processing' && (
            <motion.div key="spinner" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Loader2 className="w-4 h-4 text-accent animate-spin" />
            </motion.div>
          )}
          {item.status === 'done' && (
            <motion.div
              key="check"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 18 }}
            >
              <CheckCircle2 className="w-4 h-4 text-success" />
            </motion.div>
          )}
          {item.status === 'error' && (
            <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <AlertCircle className="w-4 h-4 text-danger" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Hover buttons */}
      <AnimatePresence>
        {isHovered && item.status !== 'processing' && (
          <>
            {/* Preview button — top-left */}
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.12 }}
              onClick={(e) => { e.stopPropagation(); onPreview(item.id); }}
              className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-foreground/70 text-background flex items-center justify-center hover:bg-accent transition-colors shadow-sm"
              aria-label="Preview"
            >
              <Eye className="w-2.5 h-2.5" />
            </motion.button>

            {/* Remove button — top-right */}
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.12 }}
              onClick={() => onRemove(item.id)}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-foreground text-background flex items-center justify-center hover:bg-danger transition-colors shadow-sm"
              aria-label="Remove file"
            >
              <X className="w-2.5 h-2.5" />
            </motion.button>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

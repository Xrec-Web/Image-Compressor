'use client';

import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import DigitCount from '@/components/digit-count';

interface ProgressBannerProps {
  current: number;
  total: number;
  currentFile?: string;
}

export default function ProgressBanner({ current, total, currentFile }: ProgressBannerProps) {
  const pct = total > 0 ? (current / total) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ duration: 0.2 }}
      className="mt-4 px-4 py-3 bg-card border border-border rounded-xl"
    >
      {/* Label row */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 text-accent animate-spin flex-shrink-0" />
          <span className="text-[13px] text-foreground font-medium">
            {currentFile ? (
              <span className="truncate max-w-[280px] inline-block align-bottom">{currentFile}</span>
            ) : (
              'Compressing…'
            )}
          </span>
        </div>

        {/* Number pop-in on the live counter */}
        <span className="font-mono text-[12px] text-muted inline-flex items-center gap-[2px]">
          <DigitCount value={current} />
          <span className="mx-0.5 opacity-50">/</span>
          <DigitCount value={total} />
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1 w-full rounded-full bg-border overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-accent origin-left"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: pct / 100 }}
          transition={{ type: 'spring', stiffness: 60, damping: 16 }}
        />
      </div>
    </motion.div>
  );
}

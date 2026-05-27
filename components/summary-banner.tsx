'use client';

import { useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import { formatBytes } from '@/lib/utils';

const BorderBeam = dynamic(
  () => import('border-beam').then((m) => m.BorderBeam),
  { ssr: false },
);

interface SummaryBannerProps {
  count: number;
  originalSize: number;
  compressedSize: number;
}

export default function SummaryBanner({ count, originalSize, compressedSize }: SummaryBannerProps) {
  const checkRef = useRef<HTMLSpanElement>(null);
  const savedBytes = originalSize - compressedSize;
  const pct = originalSize > 0 ? Math.round((savedBytes / originalSize) * 100) : 0;

  useEffect(() => {
    const wrapper = checkRef.current;
    if (!wrapper) return;

    const path = wrapper.querySelector('path');
    if (path) {
      const len = Math.ceil(path.getTotalLength());
      path.style.strokeDasharray = String(len);
      path.style.strokeDashoffset = String(len);
    }

    const t = setTimeout(() => {
      wrapper.setAttribute('data-state', 'in');
    }, 220);

    return () => clearTimeout(t);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
      className="mt-4"
    >
      <BorderBeam size="md" colorVariant="colorful" theme="dark">
        <div className="flex items-center gap-3 px-4 py-3 bg-success/[0.06] border border-border rounded-xl">
          {/* Success check icon */}
          <div className="w-7 h-7 rounded-full bg-success/10 flex items-center justify-center flex-shrink-0 overflow-visible">
            <span
              ref={checkRef}
              className="t-success-check"
              data-state="out"
              aria-hidden="true"
              style={{
                '--check-y-amount': '7px',
                '--check-rotate-from': '35deg',
                '--check-blur-from': '3px',
                '--check-bob-dur': '380ms',
              } as React.CSSProperties}
            >
              <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5 text-success">
                <path
                  d="M20 6 L9 17 L4 12"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </div>

          <p className="text-[13px] text-foreground">
            Compressed{' '}
            <span className="font-semibold">
              {count} {count === 1 ? 'image' : 'images'}
            </span>
            {savedBytes > 0 && (
              <>
                {', saved '}
                <span className="font-semibold">{formatBytes(savedBytes)}</span>
                <span className="font-mono text-[12px] ml-1.5 px-1.5 py-0.5 rounded-full bg-success/10 text-success font-semibold">
                  {pct}% reduction
                </span>
              </>
            )}
          </p>
        </div>
      </BorderBeam>
    </motion.div>
  );
}

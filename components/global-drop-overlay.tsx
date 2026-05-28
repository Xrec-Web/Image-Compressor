'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload } from 'lucide-react';

// ssr: false — same as all other BorderBeam usages; avoids style-tag hydration mismatch
const BorderBeam = dynamic(
  () => import('border-beam').then((m) => m.BorderBeam),
  { ssr: false },
);

import type { CompressionMode } from '@/types';

interface GlobalDropOverlayProps {
  onFiles: (files: File[]) => void;
  mode?: CompressionMode;
}

const isFileDrag = (e: DragEvent) =>
  Array.from(e.dataTransfer?.types ?? []).includes('Files');

const DROP_COPY: Record<CompressionMode, { title: string; types: string }> = {
  image: { title: 'Drop images anywhere', types: 'JPG · PNG · WebP · AVIF · HEIC' },
  pdf: { title: 'Drop PDFs anywhere', types: 'PDF' },
  video: { title: 'Drop videos anywhere', types: 'MP4 · WebM · MOV · MKV · AVI' },
};

export default function GlobalDropOverlay({ onFiles, mode = 'image' }: GlobalDropOverlayProps) {
  const copy = DROP_COPY[mode];
  const [active, setActive] = useState(false);
  const counter = useRef(0);

  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      counter.current++;
      setActive(true);
    };

    const onDragLeave = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      counter.current = Math.max(0, counter.current - 1);
      if (counter.current === 0) setActive(false);
    };

    const onDragOver = (e: DragEvent) => {
      if (isFileDrag(e)) e.preventDefault();
    };

    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      counter.current = 0;
      setActive(false);

      if ((e.target as Element)?.closest('[data-drop-zone]')) return;

      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length > 0) onFiles(files);
    };

    document.addEventListener('dragenter', onDragEnter);
    document.addEventListener('dragleave', onDragLeave);
    document.addEventListener('dragover', onDragOver);
    document.addEventListener('drop', onDrop, { capture: true });

    return () => {
      document.removeEventListener('dragenter', onDragEnter);
      document.removeEventListener('dragleave', onDragLeave);
      document.removeEventListener('dragover', onDragOver);
      document.removeEventListener('drop', onDrop, { capture: true });
    };
  }, [onFiles]);

  return (
    <>
      {/* Full-viewport beam — traces the screen edges while files are being dragged.
          borderRadius={0} so the beam runs flush to the screen corners.
          pointer-events-none so it never intercepts mouse events.               */}
      <BorderBeam
        size="md"
        colorVariant="colorful"
        theme="dark"
        active={active}
        borderRadius={0}
        duration={3.5}
        className="fixed inset-0 pointer-events-none z-[9895]"
      >
        <div className="w-full h-full" />
      </BorderBeam>

      {/* Soft backdrop + centered drop-hint card */}
      <AnimatePresence>
        {active && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14 }}
            className="fixed inset-0 z-[9900] pointer-events-none flex items-center justify-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.20)' }}
          >
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 380, damping: 26, delay: 0.05 }}
              className="flex flex-col items-center gap-4 px-14 py-9 rounded-2xl border border-dashed border-white/15 bg-black/35 backdrop-blur-md"
            >
              <motion.div
                animate={{ y: [0, -4, 0] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                className="w-14 h-14 rounded-xl bg-white/[0.07] border border-white/10 flex items-center justify-center"
              >
                <Upload className="w-6 h-6 text-white/55" />
              </motion.div>

              <div className="text-center">
                <p className="text-white/90 text-[15px] font-medium tracking-tight">
                  {copy.title}
                </p>
                <p className="text-white/35 text-[11px] mt-1 font-mono tracking-wider">
                  {copy.types}
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

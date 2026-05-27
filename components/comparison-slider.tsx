'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ComparisonSliderProps {
  before: string;
  after: string | null;
  isLoading?: boolean;
  beforeLabel?: string;
  afterLabel?: string;
  beforeSize?: string;
  afterSize?: string;
  reduction?: number | null;
  maxHeight?: number;
}

export default function ComparisonSlider({
  before,
  after,
  isLoading = false,
  beforeLabel = 'Original',
  afterLabel = 'Compressed',
  beforeSize,
  afterSize,
  reduction,
  maxHeight = 420,
}: ComparisonSliderProps) {
  const [pct, setPct] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [aspect, setAspect] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Detect image aspect ratio from the before source
  useEffect(() => {
    if (!before) return;
    const img = new Image();
    img.onload = () => setAspect(img.naturalWidth / img.naturalHeight);
    img.src = before;
  }, [before]);

  const updateFromClientX = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const clamped = Math.max(0, Math.min(clientX - rect.left, rect.width));
    setPct((clamped / rect.width) * 100);
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setIsDragging(true);
      updateFromClientX(e.clientX);
    },
    [updateFromClientX],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return;
      updateFromClientX(e.clientX);
    },
    [isDragging, updateFromClientX],
  );

  const handlePointerUp = useCallback(() => setIsDragging(false), []);

  const containerStyle: React.CSSProperties = {
    aspectRatio: aspect ? String(aspect) : '4/3',
    maxHeight: `${maxHeight}px`,
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative w-full overflow-hidden rounded-lg select-none bg-[#0a0a0a]',
        isDragging ? 'cursor-col-resize' : 'cursor-col-resize',
      )}
      style={containerStyle}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* After image — base layer (right side, revealed after divider) */}
      {after ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={after}
          alt="Compressed"
          className="absolute inset-0 w-full h-full object-contain"
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 bg-card" />
      )}

      {/* Before image — clipped to show only the left {pct}% */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={before}
        alt="Original"
        className="absolute inset-0 w-full h-full object-contain"
        style={{ clipPath: `inset(0 ${100 - pct}% 0 0)` }}
        draggable={false}
      />

      {/* Loading overlay — covers only the after (right) side */}
      {isLoading && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-card/70 backdrop-blur-[2px]"
          style={{ clipPath: `inset(0 0 0 ${pct}%)` }}
        >
          <Loader2 className="w-5 h-5 text-muted animate-spin" />
        </div>
      )}

      {/* Divider line */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-white/90 pointer-events-none"
        style={{
          left: `${pct}%`,
          transform: 'translateX(-50%)',
          boxShadow: '0 0 6px rgba(255,255,255,0.35)',
        }}
      />

      {/* Drag handle */}
      <div
        className={cn(
          'absolute top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none',
          'w-7 h-7 rounded-full bg-white flex items-center justify-center',
          'transition-transform duration-100',
          isDragging && 'scale-110',
        )}
        style={{
          left: `${pct}%`,
          boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
        }}
      >
        <svg width="12" height="8" viewBox="0 0 12 8" fill="none">
          <path d="M4 4H1M1 4L3 2M1 4L3 6" stroke="#111" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M8 4H11M11 4L9 2M11 4L9 6" stroke="#111" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {/* Before label */}
      <div className="absolute bottom-2 left-2 flex flex-col items-start gap-0.5 pointer-events-none">
        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-black/60 text-white/90">
          {beforeLabel}
        </span>
        {beforeSize && (
          <span className="font-mono text-[10px] text-white/60 pl-1">{beforeSize}</span>
        )}
      </div>

      {/* After label */}
      <div className="absolute bottom-2 right-2 flex flex-col items-end gap-0.5 pointer-events-none">
        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-black/60 text-white/90">
          {afterLabel}
        </span>
        {afterSize && (
          <span className="font-mono text-[10px] text-white/60 pr-1">
            {afterSize}
            {reduction != null && reduction > 0 && (
              <span className="ml-1 text-success">−{reduction}%</span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

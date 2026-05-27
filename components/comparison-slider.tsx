'use client';

import { useState, useRef, useCallback } from 'react';
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

const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.35;

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
  const [pct, setPct] = useState(50); // divider position in INNER-WRAPPER space (0–100)
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0); // inner-wrapper pan offset, px
  const [offsetY, setOffsetY] = useState(0);
  const [dragMode, setDragMode] = useState<'divider' | 'pan' | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const lastPointerRef = useRef({ x: 0, y: 0 });

  const rect = () => containerRef.current?.getBoundingClientRect() ?? null;

  // Convert a clientX screen position to an inner-wrapper pct value,
  // accounting for the current zoom and pan offset.
  const clientXToPct = useCallback(
    (clientX: number): number => {
      const r = rect();
      if (!r) return pct;
      const cx = clientX - r.left; // container-space X
      const ix = (cx - offsetX) / zoom; // inner-wrapper X
      return (Math.max(0, Math.min(r.width, ix)) / r.width) * 100;
    },
    [pct, offsetX, zoom],
  );

  // ── Wheel zoom ─────────────────────────────────────────────────────────────
  // Zooms centered on the mouse position so the content under the cursor
  // stays fixed — same UX as Figma / browser pinch-zoom.
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const r = rect();
      if (!r) return;

      const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
      const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom + delta));
      if (newZoom === zoom) return;

      const mouseX = e.clientX - r.left;
      const mouseY = e.clientY - r.top;
      const ratio = newZoom / zoom;

      // Keep the point under the mouse fixed in the zoomed view
      let nx = mouseX - (mouseX - offsetX) * ratio;
      let ny = mouseY - (mouseY - offsetY) * ratio;

      // Clamp so image never drifts outside container
      nx = Math.max(r.width * (1 - newZoom), Math.min(0, nx));
      ny = Math.max(r.height * (1 - newZoom), Math.min(0, ny));

      setZoom(newZoom);
      setOffsetX(nx);
      setOffsetY(ny);
    },
    [zoom, offsetX, offsetY],
  );

  // ── Double-click: reset zoom ───────────────────────────────────────────────
  const resetZoom = useCallback(() => {
    setZoom(1);
    setOffsetX(0);
    setOffsetY(0);
  }, []);

  // ── Container pointer: pan when zoomed ────────────────────────────────────
  const onContainerDown = useCallback(
    (e: React.PointerEvent) => {
      if (zoom <= 1) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragMode('pan');
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
    },
    [zoom],
  );

  const onContainerMove = useCallback(
    (e: React.PointerEvent) => {
      if (dragMode !== 'pan') return;
      const r = rect();
      if (!r) return;
      const dx = e.clientX - lastPointerRef.current.x;
      const dy = e.clientY - lastPointerRef.current.y;
      lastPointerRef.current = { x: e.clientX, y: e.clientY };

      setOffsetX((prev) => Math.max(r.width * (1 - zoom), Math.min(0, prev + dx)));
      setOffsetY((prev) => Math.max(r.height * (1 - zoom), Math.min(0, prev + dy)));
    },
    [dragMode, zoom],
  );

  const onContainerUp = useCallback(() => setDragMode(null), []);

  // ── Handle pointer: drag divider ───────────────────────────────────────────
  // stopPropagation prevents the container's pan handler from also firing.
  const onHandleDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragMode('divider');
      setPct(clientXToPct(e.clientX));
    },
    [clientXToPct],
  );

  const onHandleMove = useCallback(
    (e: React.PointerEvent) => {
      if (dragMode !== 'divider') return;
      setPct(clientXToPct(e.clientX));
    },
    [dragMode, clientXToPct],
  );

  const onHandleUp = useCallback(() => setDragMode(null), []);

  const isZoomed = zoom > 1;
  const cursorClass = isZoomed
    ? dragMode === 'pan'
      ? 'cursor-grabbing'
      : 'cursor-grab'
    : 'cursor-col-resize';

  return (
    <div
      ref={containerRef}
      className={cn('relative w-full overflow-hidden select-none bg-[#0a0a0a]', cursorClass)}
      style={{ height: maxHeight }}
      onWheel={handleWheel}
      onDoubleClick={resetZoom}
      onPointerDown={onContainerDown}
      onPointerMove={onContainerMove}
      onPointerUp={onContainerUp}
      onPointerCancel={onContainerUp}
    >
      {/* ── Zoom wrapper ──────────────────────────────────────────────────────
          Everything inside (images, divider, handle) shares the same
          transform so their coordinates stay consistent. The divider at pct%
          of this wrapper aligns exactly with the clip-path on the before image.
          transform-origin: 0 0 → all math is relative to top-left corner.     */}
      <div
        className="absolute inset-0"
        style={{
          transform: `translate(${offsetX}px, ${offsetY}px) scale(${zoom})`,
          transformOrigin: '0 0',
        }}
      >
        {/* After image — always full width/height, base layer */}
        {after ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={after}
            alt="Compressed"
            className="absolute inset-0 w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0 bg-card" />
        )}

        {/* Before image — clipped to show only the left pct% */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={before}
          alt="Original"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ clipPath: `inset(0 ${100 - pct}% 0 0)` }}
          draggable={false}
        />

        {/* Divider line */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white/90 pointer-events-none"
          style={{
            left: `${pct}%`,
            transform: 'translateX(-50%)',
            boxShadow: '0 0 6px rgba(255,255,255,0.3)',
          }}
        />

        {/* Drag handle — stopPropagation prevents pan mode from activating */}
        <div
          className={cn(
            'absolute top-1/2 -translate-x-1/2 -translate-y-1/2',
            'w-7 h-7 rounded-full bg-white flex items-center justify-center cursor-col-resize',
            'transition-transform duration-100',
            dragMode === 'divider' && 'scale-110',
          )}
          style={{ left: `${pct}%`, boxShadow: '0 2px 12px rgba(0,0,0,0.5)' }}
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
        >
          <svg width="12" height="8" viewBox="0 0 12 8" fill="none">
            <path d="M4 4H1M1 4L3 2M1 4L3 6" stroke="#111" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M8 4H11M11 4L9 2M11 4L9 6" stroke="#111" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      {/* ── UI overlays — outside zoom wrapper so they don't scale ──────────── */}

      {/* Loading spinner */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
            <Loader2 className="w-4 h-4 text-white/70 animate-spin" />
          </div>
        </div>
      )}

      {/* Zoom level indicator / hint */}
      <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/50 text-white/60 text-[10px] font-mono pointer-events-none">
        {isZoomed ? `${zoom.toFixed(1)}×  ·  dbl-click to reset` : 'scroll to zoom'}
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
              <span className="ml-1 text-success"> −{reduction}%</span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

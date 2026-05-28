'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { formatBytes, getVideoMetadata, estimateVideoSize, type VideoMetadata } from '@/lib/utils';
import type { FileItem, VideoSettings } from '@/types';
import { VIDEO_RESOLUTION_HEIGHTS } from '@/types';

interface VideoPreviewProps {
  file: FileItem;
  settings: VideoSettings;
}

function formatDuration(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function VideoPreview({ file, settings }: VideoPreviewProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [url] = useState(() => URL.createObjectURL(file.file));
  const [meta, setMeta] = useState<VideoMetadata | null>(null);

  // Panel reveal — double rAF so the data-open="false" initial state commits first.
  useEffect(() => {
    const id1 = requestAnimationFrame(() => {
      const id2 = requestAnimationFrame(() => {
        if (panelRef.current) panelRef.current.dataset.open = 'true';
      });
      return () => cancelAnimationFrame(id2);
    });
    return () => cancelAnimationFrame(id1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getVideoMetadata(file.file)
      .then((m) => !cancelled && setMeta(m))
      .catch(() => {});
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [file.file, url]);

  const estimate = useMemo(() => estimateVideoSize(settings, meta), [settings, meta]);
  const reduction =
    estimate != null && file.originalSize > 0
      ? Math.round(((file.originalSize - estimate) / file.originalSize) * 100)
      : null;

  const targetHeight = VIDEO_RESOLUTION_HEIGHTS[settings.resolution];
  const outHeight = targetHeight && meta ? Math.min(targetHeight, meta.height || targetHeight) : meta?.height;
  const sourceDims = meta ? `${meta.width}×${meta.height}` : '—';
  const targetLabel =
    settings.resolution === 'original'
      ? `${settings.format.toUpperCase()} · source size`
      : `${settings.format.toUpperCase()} · ${outHeight ?? targetHeight}p`;

  return (
    <div
      ref={panelRef}
      className="t-panel-slide mb-3"
      data-open="false"
      style={{ '--panel-translate-y': '20px' } as React.CSSProperties}
    >
      <div className="rounded-xl border border-border overflow-hidden bg-card">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border gap-2">
          <p className="text-[12px] text-muted min-w-0">
            Preview —{' '}
            <span className="text-foreground font-medium truncate max-w-[200px] inline-block align-bottom">
              {file.name}
            </span>
          </p>

          <div className="font-mono text-[11px] text-muted flex items-center gap-1.5 flex-shrink-0">
            <span>{formatBytes(file.originalSize)}</span>
            <span className="opacity-40">→</span>
            {estimate != null ? (
              <>
                <span className="text-foreground">≈ {formatBytes(estimate)}</span>
                {reduction != null && reduction > 0 && <span className="text-success">−{reduction}%</span>}
              </>
            ) : (
              <span className="opacity-50">estimating…</span>
            )}
          </div>
        </div>

        {/* Player */}
        <div className="bg-black flex items-center justify-center" style={{ maxHeight: 280 }}>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            src={url}
            controls
            playsInline
            preload="metadata"
            className="w-full object-contain"
            style={{ maxHeight: 280 }}
          />
        </div>

        {/* Meta strip */}
        <div className="flex items-center justify-between px-3 py-2 border-t border-border text-[11px] text-muted font-mono">
          <span>
            {formatDuration(meta?.duration ?? 0)} · {sourceDims}
          </span>
          <span className="text-foreground/70">{targetLabel}</span>
        </div>
      </div>

      <p className="mt-1.5 px-1 text-[10px] text-muted/60">
        Estimated size is approximate — the exact result depends on content and is shown after compressing.
      </p>
    </div>
  );
}

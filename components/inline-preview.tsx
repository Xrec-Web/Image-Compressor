'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { compressFile } from '@/lib/compress';
import { renderPdfPreview } from '@/lib/pdf';
import { formatBytes, isHeicFile } from '@/lib/utils';
import type { FileItem, Settings } from '@/types';
import ComparisonSlider from '@/components/comparison-slider';

interface InlinePreviewProps {
  file: FileItem;
  settings: Settings;
}

export default function InlinePreview({ file, settings }: InlinePreviewProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const isPdf = file.mode === 'pdf';

  const [beforeUrl, setBeforeUrl] = useState<string | null>(
    isPdf ? null : isHeicFile(file.file) ? file.thumbnail : URL.createObjectURL(file.file),
  );
  const [afterUrl, setAfterUrl] = useState<string | null>(null);
  const [compressedSize, setCompressedSize] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(isPdf);

  const genRef = useRef(0);
  const afterUrlRef = useRef<string | null>(null);
  const isFirstSettings = useRef(true);

  // Panel reveal — double rAF ensures the data-open="false" initial state
  // is committed to the DOM before flipping to "true" so the transition fires.
  useEffect(() => {
    const id1 = requestAnimationFrame(() => {
      const id2 = requestAnimationFrame(() => {
        if (panelRef.current) panelRef.current.dataset.open = 'true';
      });
      return () => cancelAnimationFrame(id2);
    });
    return () => cancelAnimationFrame(id1);
  }, []);

  const runCompress = useCallback(
    async (s: Settings) => {
      const gen = ++genRef.current;
      setIsLoading(true);
      try {
        const blob = await compressFile(file.file, s);
        if (genRef.current !== gen) return;
        if (afterUrlRef.current) URL.revokeObjectURL(afterUrlRef.current);

        if (isPdf) {
          afterUrlRef.current = null;
          setAfterUrl(await renderPdfPreview(blob));
        } else {
          const url = URL.createObjectURL(blob);
          afterUrlRef.current = url;
          setAfterUrl(url);
        }

        setCompressedSize(blob.size);
      } catch {
        // silently fail — loading indicator stays until resolved
      } finally {
        if (genRef.current === gen) setIsLoading(false);
      }
    },
    [file.file, isPdf],
  );

  // Initial preview + compression on mount
  useEffect(() => {
    let cancelled = false;

    async function setup() {
      if (isPdf) {
        try {
          const preview = await renderPdfPreview(file.file);
          if (!cancelled) setBeforeUrl(preview);
        } catch {
          if (!cancelled) setBeforeUrl(file.thumbnail || null);
        }
      }

      runCompress(settings);
    }

    setup();

    return () => {
      cancelled = true;
      if (beforeUrl && !isHeicFile(file.file) && !isPdf) URL.revokeObjectURL(beforeUrl);
      if (afterUrlRef.current) URL.revokeObjectURL(afterUrlRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-compress on settings change (debounced, skip the initial run)
  useEffect(() => {
    if (isFirstSettings.current) {
      isFirstSettings.current = false;
      return;
    }
    const t = setTimeout(() => runCompress(settings), 350);
    return () => clearTimeout(t);
  }, [settings, runCompress]); // eslint-disable-line react-hooks/exhaustive-deps

  const reduction =
    compressedSize != null
      ? Math.round(((file.originalSize - compressedSize) / file.originalSize) * 100)
      : null;
  const beforeLabel = isPdf ? 'Original PDF' : 'Original';
  const afterLabel = isPdf ? `PDF · ${settings.quality}` : `${settings.format.toUpperCase()} · ${settings.quality}`;

  return (
    // data-open starts false; the useEffect flips it to true to fire the panel reveal.
    // --panel-translate-y overridden to 20px — subtle lift suits an inline element.
    <div
      ref={panelRef}
      className="t-panel-slide mb-3"
      data-open="false"
      style={{ '--panel-translate-y': '20px' } as React.CSSProperties}
    >
      <div className="rounded-xl border border-border overflow-hidden bg-card">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <p className="text-[12px] text-muted">
            Preview —{' '}
            <span className="text-foreground font-medium truncate max-w-[200px] inline-block align-bottom">
              {file.name}
            </span>
          </p>

          {compressedSize != null && !isLoading && (
            <div className="font-mono text-[11px] text-muted flex items-center gap-1.5 flex-shrink-0">
              <span>{formatBytes(file.originalSize)}</span>
              <span className="opacity-40">→</span>
              <span className="text-foreground">{formatBytes(compressedSize)}</span>
              {reduction != null && reduction > 0 && (
                <span className="text-success">−{reduction}%</span>
              )}
            </div>
          )}
        </div>

        {/* Comparison slider */}
        {beforeUrl && (
          <ComparisonSlider
            before={beforeUrl}
            after={afterUrl}
            isLoading={isLoading}
            beforeLabel={beforeLabel}
            afterLabel={afterLabel}
            beforeSize={formatBytes(file.originalSize)}
            afterSize={compressedSize != null ? formatBytes(compressedSize) : undefined}
            reduction={reduction}
            maxHeight={280}
          />
        )}
      </div>
    </div>
  );
}

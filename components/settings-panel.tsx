'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Settings, OutputFormat, QualityPreset, MaxDimension, CompressionMode } from '@/types';

interface SettingsPanelProps {
  mode?: CompressionMode;
  settings: Settings;
  onChange: (settings: Settings) => void;
  /** Largest pixel dimension of the uploaded image(s); limits the Max-size choices. */
  sourceDimension?: number;
  disabled?: boolean;
}

// ── Segmented Control ──────────────────────────────────────────────────────
interface SegmentProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}

export function SegmentedControl<T extends string>({ options, value, onChange, disabled }: SegmentProps<T>) {
  return (
    <div
      className={cn(
        'inline-flex rounded-md border border-border overflow-hidden',
        disabled && 'opacity-40 pointer-events-none',
      )}
    >
      {options.map((opt, i) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            'px-3.5 py-1.5 text-[13px] font-medium transition-colors leading-none',
            i > 0 && 'border-l border-border',
            value === opt.value
              ? 'bg-foreground text-background'
              : 'bg-transparent text-muted hover:text-foreground hover:bg-foreground/[0.04]',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Custom Dropdown ────────────────────────────────────────────────────────
// Uses position:fixed so the panel escapes overflow:hidden from BorderBeam's wrapper.
interface DropdownProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}

export function CustomDropdown<T extends string>({ options, value, onChange, disabled }: DropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const openDropdown = useCallback(() => {
    if (disabled || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPanelStyle({
      position: 'fixed',
      top: rect.bottom + 6,
      left: rect.left,
      minWidth: rect.width,
      zIndex: 9000,
    });
    setOpen(true);
  }, [disabled]);

  const closeDropdown = useCallback(() => setOpen(false), []);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !panelRef.current?.contains(t)) {
        closeDropdown();
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, closeDropdown]);

  // Close on Escape or scroll/resize (position would be stale)
  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => e.key === 'Escape' && closeDropdown();
    document.addEventListener('keydown', close);
    window.addEventListener('scroll', closeDropdown, { capture: true });
    window.addEventListener('resize', closeDropdown);
    return () => {
      document.removeEventListener('keydown', close);
      window.removeEventListener('scroll', closeDropdown, { capture: true });
      window.removeEventListener('resize', closeDropdown);
    };
  }, [open, closeDropdown]);

  const selected = options.find((o) => o.value === value);

  return (
    <div className={cn(disabled && 'opacity-40 pointer-events-none')}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? closeDropdown() : openDropdown())}
        className={cn(
          'inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-border',
          'bg-card text-[13px] font-medium text-foreground min-w-[108px] justify-between',
          'transition-colors duration-100',
          open ? 'border-foreground/30' : 'hover:border-foreground/25',
        )}
      >
        <span className="font-mono">{selected?.label}</span>
        <ChevronDown
          className={cn(
            'w-3 h-3 text-muted flex-shrink-0 transition-transform duration-150',
            open && 'rotate-180',
          )}
        />
      </button>

      {mounted && createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={panelRef}
              style={panelStyle}
              initial={{ opacity: 0, scale: 0.97, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: -4 }}
              transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }}
              className="py-1 rounded-xl border border-border bg-card shadow-2xl overflow-hidden"
            >
              {options.map((opt) => {
                const active = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      onChange(opt.value);
                      closeDropdown();
                    }}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-3 py-2 text-[13px] transition-colors text-left',
                      active
                        ? 'text-foreground'
                        : 'text-muted hover:text-foreground hover:bg-foreground/[0.05]',
                    )}
                  >
                    <span className="w-3.5 flex-shrink-0 flex items-center justify-center">
                      {active && <Check className="w-3 h-3 text-accent" />}
                    </span>
                    <span className={cn('font-mono', !active && 'opacity-70')}>{opt.label}</span>
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}

// ── Settings Panel ─────────────────────────────────────────────────────────
const FORMAT_OPTIONS: { value: OutputFormat; label: string }[] = [
  { value: 'jpg', label: 'JPG' },
  { value: 'webp', label: 'WebP' },
  { value: 'avif', label: 'AVIF' },
  { value: 'png', label: 'PNG' },
];

const QUALITY_OPTIONS: { value: QualityPreset; label: string }[] = [
  { value: 'high', label: 'High' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'small', label: 'Small' },
];

const DIMENSION_OPTIONS: { value: MaxDimension; label: string }[] = [
  { value: 'original', label: 'Original' },
  { value: '2560', label: '2560 px' },
  { value: '1920', label: '1920 px' },
  { value: '1280', label: '1280 px' },
  { value: '800', label: '800 px' },
];

export default function SettingsPanel({
  mode = 'image',
  settings,
  onChange,
  sourceDimension,
  disabled,
}: SettingsPanelProps) {
  // Only offer a max-size that's actually smaller than the source (otherwise it
  // wouldn't resize). "Original" is always available and shows the source size.
  const dimensionOptions = useMemo<{ value: MaxDimension; label: string }[]>(() => {
    return DIMENSION_OPTIONS.filter(
      (o) => o.value === 'original' || sourceDimension == null || Number(o.value) < sourceDimension,
    ).map((o) =>
      o.value === 'original' && sourceDimension
        ? { ...o, label: `Original · ${sourceDimension}px` }
        : o,
    );
  }, [sourceDimension]);

  if (mode === 'pdf') {
    return (
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 bg-card border border-border rounded-xl">
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-medium text-muted uppercase tracking-widest whitespace-nowrap">Format</span>
          <div className="inline-flex rounded-md border border-border overflow-hidden">
            <span className="px-3.5 py-1.5 text-[13px] font-medium leading-none bg-foreground text-background">
              PDF
            </span>
          </div>
        </div>

        <div className="w-px h-5 bg-border hidden sm:block" />

        <div className="flex items-center gap-2.5">
          <span className="text-xs font-medium text-muted uppercase tracking-widest whitespace-nowrap">Quality</span>
          <SegmentedControl<QualityPreset>
            options={QUALITY_OPTIONS}
            value={settings.quality}
            onChange={(quality) => onChange({ ...settings, quality })}
            disabled={disabled}
          />
        </div>

        <div className="w-px h-5 bg-border hidden sm:block" />

        <div className="flex items-center gap-2.5">
          <span className="text-xs font-medium text-muted uppercase tracking-widest whitespace-nowrap">Max size</span>
          <CustomDropdown<MaxDimension>
            options={dimensionOptions}
            value={settings.maxDimension}
            onChange={(maxDimension) => onChange({ ...settings, maxDimension })}
            disabled={disabled}
          />
        </div>

        <p className="ml-auto text-xs text-muted hidden lg:block">
          {settings.quality === 'high' && 'higher fidelity pages · larger files'}
          {settings.quality === 'balanced' && 'best balance for mixed documents'}
          {settings.quality === 'small' && 'stronger compression · softer detail'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 bg-card border border-border rounded-xl">
      {/* Format */}
      <div className="flex items-center gap-2.5">
        <span className="text-xs font-medium text-muted uppercase tracking-widest whitespace-nowrap">Format</span>
        <SegmentedControl<OutputFormat>
          options={FORMAT_OPTIONS}
          value={settings.format}
          onChange={(format) => onChange({ ...settings, format })}
          disabled={disabled}
        />
      </div>

      <div className="w-px h-5 bg-border hidden sm:block" />

      {/* Quality */}
      <div className="flex items-center gap-2.5">
        <span className="text-xs font-medium text-muted uppercase tracking-widest whitespace-nowrap">Quality</span>
        <SegmentedControl<QualityPreset>
          options={QUALITY_OPTIONS}
          value={settings.quality}
          onChange={(quality) => onChange({ ...settings, quality })}
          disabled={disabled}
        />
      </div>

      <div className="w-px h-5 bg-border hidden sm:block" />

      {/* Max dimension */}
      <div className="flex items-center gap-2.5">
        <span className="text-xs font-medium text-muted uppercase tracking-widest whitespace-nowrap">Max size</span>
        <CustomDropdown<MaxDimension>
          options={DIMENSION_OPTIONS}
          value={settings.maxDimension}
          onChange={(maxDimension) => onChange({ ...settings, maxDimension })}
          disabled={disabled}
        />
      </div>

      {/* Quality hint */}
      <p className="ml-auto text-xs text-muted hidden lg:block">
        {settings.format === 'png'
          ? 'lossless · quality preset only affects resize'
          : <>
              {settings.quality === 'high' && 'q85 · minimal visible loss'}
              {settings.quality === 'balanced' && 'q75 · web-ready default'}
              {settings.quality === 'small' && 'q60 · aggressive compression'}
              {settings.format === 'avif' && ' · WASM-encoded, slower'}
            </>
        }
      </p>
    </div>
  );
}

'use client';

import { cn } from '@/lib/utils';
import { SegmentedControl, CustomDropdown } from '@/components/settings-panel';
import type {
  VideoSettings,
  VideoFormat,
  VideoResolution,
  VideoFps,
  AudioBitrate,
} from '@/types';
import { VIDEO_CRF_RANGE } from '@/types';

interface VideoSettingsPanelProps {
  settings: VideoSettings;
  onChange: (settings: VideoSettings) => void;
  disabled?: boolean;
}

const FORMAT_OPTIONS: { value: VideoFormat; label: string }[] = [
  { value: 'mp4', label: 'MP4 · H.264' },
  { value: 'webm', label: 'WebM · VP9' },
];

const RESOLUTION_OPTIONS: { value: VideoResolution; label: string }[] = [
  { value: 'original', label: 'Original' },
  { value: '1440', label: '1440p' },
  { value: '1080', label: '1080p' },
  { value: '720', label: '720p' },
  { value: '480', label: '480p' },
];

const FPS_OPTIONS: { value: VideoFps; label: string }[] = [
  { value: 'original', label: 'Source' },
  { value: '30', label: '30' },
  { value: '24', label: '24' },
];

const AUDIO_OPTIONS: { value: AudioBitrate; label: string }[] = [
  { value: '192', label: '192 kbps' },
  { value: '128', label: '128 kbps' },
  { value: '96', label: '96 kbps' },
  { value: 'mute', label: 'Mute' },
];

const Divider = () => <div className="w-px h-5 bg-border hidden lg:block" />;

const Label = ({ children }: { children: React.ReactNode }) => (
  <span className="text-xs font-medium text-muted uppercase tracking-widest whitespace-nowrap">
    {children}
  </span>
);

function Toggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-2 text-[13px] font-medium transition-colors',
        disabled ? 'opacity-40 pointer-events-none' : 'hover:text-foreground',
        checked ? 'text-foreground' : 'text-muted',
      )}
    >
      <span
        className={cn(
          'relative w-8 h-[18px] rounded-full transition-colors duration-150 flex-shrink-0',
          checked ? 'bg-accent' : 'bg-foreground/15',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 w-[14px] h-[14px] rounded-full bg-white transition-transform duration-150',
            checked && 'translate-x-[14px]',
          )}
        />
      </span>
      {label}
    </button>
  );
}

export default function VideoSettingsPanel({ settings, onChange, disabled }: VideoSettingsPanelProps) {
  const range = VIDEO_CRF_RANGE[settings.format];

  const handleFormatChange = (format: VideoFormat) => {
    // CRF scales differ per encoder — remap to the new format's default.
    onChange({ ...settings, format, crf: VIDEO_CRF_RANGE[format].default });
  };

  // 0 = best quality end of the slider, 1 = smallest file.
  const qualityFraction = (settings.crf - range.min) / (range.max - range.min);
  const qualityWord =
    qualityFraction <= 0.33 ? 'high quality' : qualityFraction >= 0.66 ? 'smaller file' : 'balanced';

  return (
    <div className="px-4 py-3 bg-card border border-border rounded-xl">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {/* Format */}
        <div className="flex items-center gap-2.5">
          <Label>Format</Label>
          <SegmentedControl<VideoFormat>
            options={FORMAT_OPTIONS}
            value={settings.format}
            onChange={handleFormatChange}
            disabled={disabled}
          />
        </div>

        <Divider />

        {/* Resolution */}
        <div className="flex items-center gap-2.5">
          <Label>Resolution</Label>
          <CustomDropdown<VideoResolution>
            options={RESOLUTION_OPTIONS}
            value={settings.resolution}
            onChange={(resolution) => onChange({ ...settings, resolution })}
            disabled={disabled}
          />
        </div>

        <Divider />

        {/* Frame rate */}
        <div className="flex items-center gap-2.5">
          <Label>FPS</Label>
          <SegmentedControl<VideoFps>
            options={FPS_OPTIONS}
            value={settings.fps}
            onChange={(fps) => onChange({ ...settings, fps })}
            disabled={disabled}
          />
        </div>

        <Divider />

        {/* Audio */}
        <div className="flex items-center gap-2.5">
          <Label>Audio</Label>
          <CustomDropdown<AudioBitrate>
            options={AUDIO_OPTIONS}
            value={settings.audioBitrate}
            onChange={(audioBitrate) => onChange({ ...settings, audioBitrate })}
            disabled={disabled}
          />
        </div>
      </div>

      {/* Quality (CRF) slider */}
      <div className={cn('mt-4 pt-3 border-t border-border', disabled && 'opacity-40 pointer-events-none')}>
        <div className="flex items-center gap-4">
          <Label>Quality</Label>
          <input
            type="range"
            min={range.min}
            max={range.max}
            step={1}
            value={settings.crf}
            onChange={(e) => onChange({ ...settings, crf: Number(e.target.value) })}
            disabled={disabled}
            className="flex-1 h-1.5 cursor-pointer"
            style={{ accentColor: 'var(--color-accent)' }}
          />
          <span className="font-mono text-[12px] text-foreground tabular-nums whitespace-nowrap">
            CRF {settings.crf}
          </span>
          <span className="text-[11px] text-muted w-[78px] text-right hidden sm:block">
            {qualityWord}
          </span>
        </div>
        <div className="flex justify-between mt-1.5 text-[10px] text-muted/70 font-mono">
          <span>← best quality</span>
          <span>smaller file →</span>
        </div>
      </div>

      {/* Web options */}
      <div className="mt-3 pt-3 border-t border-border flex flex-wrap items-center gap-x-6 gap-y-2.5">
        <Label>Web</Label>
        <Toggle
          label={settings.format === 'webm' ? 'Fast start (MP4 only)' : 'Fast start'}
          checked={settings.format === 'mp4' && settings.faststart}
          onChange={(faststart) => onChange({ ...settings, faststart })}
          disabled={disabled || settings.format === 'webm'}
        />
        <Toggle
          label="Strip metadata"
          checked={settings.stripMetadata}
          onChange={(stripMetadata) => onChange({ ...settings, stripMetadata })}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

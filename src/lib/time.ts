// Time helpers: convert between seconds and a human "HH:MM:SS.mmm" timecode.

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Format seconds as "M:SS.mmm" (or "H:MM:SS.mmm" past an hour). */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds - Math.floor(seconds)) * 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  const msStr = pad(ms, 3);
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}.${msStr}`;
  return `${m}:${pad(s)}.${msStr}`;
}

/** Format seconds as FFmpeg-friendly "HH:MM:SS.mmm". */
export function toFfmpegTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${s.toFixed(3).padStart(6, '0')}`;
}

/**
 * Parse a timecode string into seconds. Accepts "SS", "SS.mmm", "MM:SS",
 * "MM:SS.mmm", or "HH:MM:SS.mmm". Returns null if unparseable.
 */
export function parseTime(input: string): number | null {
  const text = input.trim();
  if (text === '') return null;
  const parts = text.split(':');
  if (parts.length > 3) return null;
  let seconds = 0;
  for (const part of parts) {
    if (part === '' || Number.isNaN(Number(part))) return null;
    seconds = seconds * 60 + Number(part);
  }
  return Number.isFinite(seconds) ? seconds : null;
}

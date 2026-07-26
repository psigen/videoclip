import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { clamp, toFfmpegTime } from './time';
import type { CropRegion } from '../types';

// ---------------------------------------------------------------------------
// Core loading
//
// The single-thread ffmpeg core lives under public/ffmpeg (copied from
// node_modules by scripts/copy-ffmpeg.mjs) and is served same-origin so the
// @ffmpeg/util blob loader can fetch it.
// ---------------------------------------------------------------------------

function assetUrl(path: string): string {
  // base is './' (see vite.config.ts); resolve against the current document.
  const base = import.meta.env.BASE_URL || './';
  return new URL(`${base}ffmpeg/${path}`, window.location.href).href;
}

let ffmpegSingleton: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

export type LogHandler = (message: string) => void;

/**
 * Load (once) and return the shared FFmpeg instance.
 *
 * We use the single-thread core. It needs no SharedArrayBuffer / cross-origin
 * isolation, so it runs anywhere — including GitHub Pages, which can't send the
 * COOP/COEP headers. (The multi-thread core was intentionally dropped: it
 * requires that isolation and loaded unreliably across browser/worker environments.)
 */
export function loadFfmpeg(onLog?: LogHandler): Promise<FFmpeg> {
  if (ffmpegSingleton) return Promise.resolve(ffmpegSingleton);
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const ffmpeg = new FFmpeg();
    if (onLog) ffmpeg.on('log', ({ message }) => onLog(message));
    const coreURL = await toBlobURL(assetUrl('ffmpeg-core.js'), 'text/javascript');
    const wasmURL = await toBlobURL(assetUrl('ffmpeg-core.wasm'), 'application/wasm');
    await ffmpeg.load({ coreURL, wasmURL });
    ffmpegSingleton = ffmpeg;
    return ffmpeg;
  })().catch((err) => {
    loadPromise = null; // allow a retry after a failed load
    throw err;
  });

  return loadPromise;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export interface GifOptions {
  format: 'gif';
  fps: number; // frames per second
  width: number | null; // output width in px (height auto, keeps aspect); null = native resolution
  dither: boolean; // smoother gradients vs smaller file
  loop: boolean; // loop forever (true) vs play once (false)
}

export interface Mp4Options {
  format: 'mp4';
  crf: number; // 0 (lossless) .. 51 (worst); ~18-23 is high quality
  maxWidth: number | null; // cap width (keeps aspect, never upscales) or null = original
  includeAudio: boolean;
}

export interface WebmOptions {
  format: 'webm';
  crf: number; // VP8 CRF 4 (best) .. 63 (worst); ~10 is high quality
  maxWidth: number | null; // cap width (keeps aspect, never upscales) or null = original
  includeAudio: boolean;
}

export type ExportOptions = GifOptions | Mp4Options | WebmOptions;

export interface ExportRequest {
  file: File | Blob;
  fileName: string; // original name, used to derive the input extension
  start: number; // seconds
  end: number; // seconds
  options: ExportOptions;
  crop?: CropRegion | null; // spatial crop (fractions of source); null/undefined = full frame
  onProgress?: (ratio: number) => void;
  onLog?: LogHandler;
}

export interface ExportResult {
  blob: Blob;
  fileName: string;
  url: string; // object URL for download/preview (caller revokes)
}

function extensionFor(fileName: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(fileName);
  return m ? m[1].toLowerCase() : 'mp4';
}

function baseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '') || 'clip';
}

// libx264/yuv420p require even width AND height; VP9 is happier with them too.
// Cap to maxWidth when set (never upscale via min()), else keep original size;
// 2*trunc(.../2) forces the width even, -2 forces the height even. This is what
// keeps odd-sized sources (common with webm / phone captures, e.g. 978x1175)
// from failing to encode.
function evenScaleFilter(maxWidth: number | null): string {
  const widthCap = maxWidth ? `min(${maxWidth}\\,iw)` : 'iw';
  return `scale='2*trunc(${widthCap}/2)':-2:flags=lanczos`;
}

// A `crop` filter placed BEFORE `scale`, expressed as fractions of the source
// via iw/ih so no source dimensions are needed in JS. Returns null for no crop
// or a full-frame crop (nothing to do). The expression contains only iw/ih/*/:
// and digits — no comma — so it needs no escaping and is a single filter.
// Any odd dims it produces are normalized to even by the trailing scale (MP4/WebM);
// GIF is palette-based so odd dims are fine there.
function cropFilter(crop: CropRegion | null | undefined): string | null {
  if (!crop) return null;
  const w = clamp(crop.width, 0, 1);
  const h = clamp(crop.height, 0, 1);
  const x = clamp(crop.x, 0, 1 - w);
  const y = clamp(crop.y, 0, 1 - h);
  if (w <= 0 || h <= 0) return null;
  if (w >= 0.999 && h >= 0.999 && x <= 0.001 && y <= 0.001) return null; // full frame = no-op
  const f = (n: number) => n.toFixed(6);
  return `crop=iw*${f(w)}:ih*${f(h)}:iw*${f(x)}:ih*${f(y)}`;
}

/** Join filter fragments into an ffmpeg filterchain, dropping the null/empty ones. */
function chainFilters(...parts: Array<string | null>): string {
  return parts.filter((s): s is string => Boolean(s)).join(',');
}

/** Trim + encode the selected range, returning a downloadable blob. */
export async function exportClip(req: ExportRequest): Promise<ExportResult> {
  const { file, fileName, start, end, options, crop, onProgress, onLog } = req;
  const ffmpeg = await loadFfmpeg(onLog);
  const cf = cropFilter(crop);

  const ext = extensionFor(fileName);
  const inputName = `input.${ext}`;
  const ss = toFfmpegTime(start);
  const to = toFfmpegTime(Math.max(start, end));

  let progressHandler: ((e: { progress: number }) => void) | undefined;
  if (onProgress) {
    progressHandler = ({ progress }) => onProgress(Math.max(0, Math.min(1, progress)));
    ffmpeg.on('progress', progressHandler);
  }

  // Capture recent ffmpeg log lines so a failure can report the real cause.
  const logs: string[] = [];
  const logHandler = ({ message }: { message: string }) => {
    logs.push(message);
    if (logs.length > 40) logs.shift();
  };
  ffmpeg.on('log', logHandler);

  // Run an ffmpeg command and fail loudly (with logs) on a non-zero exit code,
  // since exec() resolves with the code rather than throwing.
  const runExec = async (args: string[], label: string) => {
    const code = await ffmpeg.exec(args);
    if (code !== 0) {
      throw new Error(`ffmpeg ${label} failed (exit ${code}):\n${logs.slice(-12).join('\n')}`);
    }
  };

  const written: string[] = [];
  try {
    await ffmpeg.writeFile(inputName, await fetchFile(file));
    written.push(inputName);

    if (options.format === 'gif') {
      const outName = `${baseName(fileName)}.gif`;
      // Blank width = native resolution: omit the scale filter entirely.
      const scale = options.width != null ? `scale=${options.width}:-1:flags=lanczos` : null;
      const fps = `fps=${options.fps}`;
      const dither = options.dither ? 'dither=bayer:bayer_scale=5:diff_mode=rectangle' : 'dither=none';
      const palette = 'palette.png';
      // Crop before scale so a set width applies to the cropped frame; crop must
      // appear in BOTH passes so the palette matches the rendered geometry.
      const geom = chainFilters(fps, cf, scale);

      // Pass 1: build an optimal palette for the selected range.
      await runExec([
        '-ss', ss, '-to', to, '-i', inputName,
        '-vf', chainFilters(geom, 'palettegen=stats_mode=diff'),
        '-y', palette,
      ], 'palette');
      written.push(palette);

      // Pass 2: render the GIF using that palette; -loop 0 = loop forever.
      await runExec([
        '-ss', ss, '-to', to, '-i', inputName, '-i', palette,
        '-lavfi', `${geom} [x]; [x][1:v] paletteuse=${dither}`,
        '-loop', options.loop ? '0' : '-1',
        '-y', outName,
      ], 'gif');
      written.push(outName);

      const data = await ffmpeg.readFile(outName);
      const blob = new Blob([new Uint8Array(data as Uint8Array)], { type: 'image/gif' });
      return { blob, fileName: outName, url: URL.createObjectURL(blob) };
    }

    if (options.format === 'webm') {
      // WebM (VP8 + Opus). VP8 — not VP9 — because libvpx-vp9 traps ("memory
      // access out of bounds") in the single-thread wasm core; VP8 encodes
      // reliably. CRF mode: -b:v 0 makes -crf the sole quality target.
      const outName = `${baseName(fileName)}-clip.webm`;
      const args = [
        '-ss', ss, '-to', to, '-i', inputName,
        '-vf', chainFilters(cf, evenScaleFilter(options.maxWidth)),
        '-c:v', 'libvpx',
        '-crf', String(options.crf),
        '-b:v', '0',
        '-deadline', 'good',
        '-cpu-used', '4', // quality/speed balance for the single-thread wasm core
        '-pix_fmt', 'yuv420p',
      ];
      if (options.includeAudio) {
        args.push('-c:a', 'libopus', '-b:a', '128k');
      } else {
        args.push('-an');
      }
      args.push('-y', outName);

      await runExec(args, 'webm');
      written.push(outName);

      const data = await ffmpeg.readFile(outName);
      const blob = new Blob([new Uint8Array(data as Uint8Array)], { type: 'video/webm' });
      return { blob, fileName: outName, url: URL.createObjectURL(blob) };
    }

    // MP4 (H.264). Re-encode for a frame-accurate cut and broad compatibility.
    const outName = `${baseName(fileName)}-clip.mp4`;
    // Cap width, keep aspect, force even dims (yuv420p requires them), never upscale.
    const args = [
      '-ss', ss, '-to', to, '-i', inputName,
      '-vf', chainFilters(cf, evenScaleFilter(options.maxWidth)),
    ];
    args.push(
      '-c:v', 'libx264',
      '-crf', String(options.crf),
      '-preset', 'veryfast',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
    );
    if (options.includeAudio) {
      args.push('-c:a', 'aac', '-b:a', '128k');
    } else {
      args.push('-an');
    }
    args.push('-y', outName);

    await runExec(args, 'mp4');
    written.push(outName);

    const data = await ffmpeg.readFile(outName);
    const blob = new Blob([new Uint8Array(data as Uint8Array)], { type: 'video/mp4' });
    return { blob, fileName: outName, url: URL.createObjectURL(blob) };
  } finally {
    ffmpeg.off('log', logHandler);
    if (progressHandler) ffmpeg.off('progress', progressHandler);
    // Best-effort cleanup of the virtual FS so repeated exports don't accumulate.
    for (const name of written) {
      try {
        await ffmpeg.deleteFile(name);
      } catch {
        /* ignore */
      }
    }
  }
}

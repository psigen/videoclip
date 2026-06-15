import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { toFfmpegTime } from './time';

// ---------------------------------------------------------------------------
// Core loading
//
// We ship BOTH cores under public/ffmpeg (copied from node_modules by
// scripts/copy-ffmpeg.mjs) and pick at runtime:
//   - multi-thread ("mt") when the page is cross-origin isolated (faster), or
//   - single-thread ("st") otherwise.
// GitHub Pages can't set COOP/COEP, so it runs single-thread — which keeps the
// Google Picker working. Self-hosting behind COOP/COEP headers auto-upgrades.
// ---------------------------------------------------------------------------

export type CoreKind = 'mt' | 'st';

export const coreKind: CoreKind =
  typeof self !== 'undefined' && (self as unknown as { crossOriginIsolated?: boolean }).crossOriginIsolated
    ? 'mt'
    : 'st';

function assetUrl(path: string): string {
  // base is './' (see vite.config.ts); resolve against the current document.
  const base = import.meta.env.BASE_URL || './';
  return new URL(`${base}ffmpeg/${path}`, window.location.href).href;
}

let ffmpegSingleton: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

export type LogHandler = (message: string) => void;

/** Load (once) and return the shared FFmpeg instance. */
export function loadFfmpeg(onLog?: LogHandler): Promise<FFmpeg> {
  if (ffmpegSingleton) return Promise.resolve(ffmpegSingleton);
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const ffmpeg = new FFmpeg();
    if (onLog) ffmpeg.on('log', ({ message }) => onLog(message));

    const dir = coreKind; // 'mt' | 'st'
    const coreURL = await toBlobURL(assetUrl(`${dir}/ffmpeg-core.js`), 'text/javascript');
    const wasmURL = await toBlobURL(assetUrl(`${dir}/ffmpeg-core.wasm`), 'application/wasm');
    const config: { coreURL: string; wasmURL: string; workerURL?: string } = { coreURL, wasmURL };
    if (coreKind === 'mt') {
      config.workerURL = await toBlobURL(assetUrl('mt/ffmpeg-core.worker.js'), 'text/javascript');
    }

    await ffmpeg.load(config);
    ffmpegSingleton = ffmpeg;
    return ffmpeg;
  })();

  return loadPromise;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export interface GifOptions {
  format: 'gif';
  fps: number; // frames per second
  width: number; // output width in px; height auto (keeps aspect)
  dither: boolean; // smoother gradients vs smaller file
  loop: boolean; // loop forever (true) vs play once (false)
}

export interface Mp4Options {
  format: 'mp4';
  crf: number; // 0 (lossless) .. 51 (worst); ~18-23 is high quality
  maxWidth: number | null; // cap width (keeps aspect, never upscales) or null = original
  includeAudio: boolean;
}

export type ExportOptions = GifOptions | Mp4Options;

export interface ExportRequest {
  file: File | Blob;
  fileName: string; // original name, used to derive the input extension
  start: number; // seconds
  end: number; // seconds
  options: ExportOptions;
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

/** Trim + encode the selected range, returning a downloadable blob. */
export async function exportClip(req: ExportRequest): Promise<ExportResult> {
  const { file, fileName, start, end, options, onProgress, onLog } = req;
  const ffmpeg = await loadFfmpeg(onLog);

  const ext = extensionFor(fileName);
  const inputName = `input.${ext}`;
  const ss = toFfmpegTime(start);
  const to = toFfmpegTime(Math.max(start, end));

  let progressHandler: ((e: { progress: number }) => void) | undefined;
  if (onProgress) {
    progressHandler = ({ progress }) => onProgress(Math.max(0, Math.min(1, progress)));
    ffmpeg.on('progress', progressHandler);
  }

  const written: string[] = [];
  try {
    await ffmpeg.writeFile(inputName, await fetchFile(file));
    written.push(inputName);

    if (options.format === 'gif') {
      const outName = `${baseName(fileName)}.gif`;
      const scale = `scale=${options.width}:-1:flags=lanczos`;
      const dither = options.dither ? 'dither=bayer:bayer_scale=5:diff_mode=rectangle' : 'dither=none';
      const palette = 'palette.png';

      // Pass 1: build an optimal palette for the selected range.
      await ffmpeg.exec([
        '-ss', ss, '-to', to, '-i', inputName,
        '-vf', `fps=${options.fps},${scale},palettegen=stats_mode=diff`,
        '-y', palette,
      ]);
      written.push(palette);

      // Pass 2: render the GIF using that palette; -loop 0 = loop forever.
      await ffmpeg.exec([
        '-ss', ss, '-to', to, '-i', inputName, '-i', palette,
        '-lavfi', `fps=${options.fps},${scale} [x]; [x][1:v] paletteuse=${dither}`,
        '-loop', options.loop ? '0' : '-1',
        '-y', outName,
      ]);
      written.push(outName);

      const data = await ffmpeg.readFile(outName);
      const blob = new Blob([new Uint8Array(data as Uint8Array)], { type: 'image/gif' });
      return { blob, fileName: outName, url: URL.createObjectURL(blob) };
    }

    // MP4 (H.264). Re-encode for a frame-accurate cut and broad compatibility.
    const outName = `${baseName(fileName)}-clip.mp4`;
    const args = ['-ss', ss, '-to', to, '-i', inputName];
    if (options.maxWidth) {
      // Cap width, keep aspect, force even dims (yuv420p), never upscale.
      args.push('-vf', `scale='min(${options.maxWidth}\\,iw)':-2:flags=lanczos`);
    }
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

    await ffmpeg.exec(args);
    written.push(outName);

    const data = await ffmpeg.readFile(outName);
    const blob = new Blob([new Uint8Array(data as Uint8Array)], { type: 'video/mp4' });
    return { blob, fileName: outName, url: URL.createObjectURL(blob) };
  } finally {
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

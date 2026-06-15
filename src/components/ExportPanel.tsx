import { useEffect, useState } from 'react';
import type { UseFfmpeg } from '../hooks/useFfmpeg';
import type { ExportOptions, GifOptions, Mp4Options } from '../lib/ffmpeg';
import { formatTime } from '../lib/time';
import type { VideoSource } from '../types';

interface Props {
  source: VideoSource;
  start: number;
  end: number;
  ffmpeg: UseFfmpeg;
}

const defaultGif: GifOptions = { format: 'gif', fps: 15, width: 480, dither: true, loop: true };
const defaultMp4: Mp4Options = { format: 'mp4', crf: 20, maxWidth: null, includeAudio: true };

export function ExportPanel({ source, start, end, ffmpeg }: Props) {
  const [format, setFormat] = useState<'gif' | 'mp4'>('gif');
  const [gif, setGif] = useState<GifOptions>(defaultGif);
  const [mp4, setMp4] = useState<Mp4Options>(defaultMp4);
  const [result, setResult] = useState<{ url: string; name: string; size: number } | null>(null);

  const clipDuration = Math.max(0, end - start);

  // Revoke the previous result URL when a new one replaces it / on unmount.
  useEffect(() => {
    return () => {
      if (result) URL.revokeObjectURL(result.url);
    };
  }, [result]);

  const longGif = format === 'gif' && clipDuration > 15;

  async function onExport() {
    const options: ExportOptions = format === 'gif' ? gif : mp4;
    const out = await ffmpeg.run({ file: source.file, fileName: source.name, start, end, options });
    if (out) {
      setResult((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { url: out.url, name: out.fileName, size: out.blob.size };
      });
    }
  }

  return (
    <section className="card export">
      <h2>Export</h2>

      <div className="seg">
        <button className={format === 'gif' ? 'active' : ''} onClick={() => setFormat('gif')}>
          GIF
        </button>
        <button className={format === 'mp4' ? 'active' : ''} onClick={() => setFormat('mp4')}>
          MP4
        </button>
      </div>

      <p className="clip-info">
        Clip: <strong>{formatTime(start)}</strong> → <strong>{formatTime(end)}</strong>{' '}
        ({clipDuration.toFixed(2)}s)
      </p>

      {format === 'gif' ? (
        <div className="options">
          <label>
            FPS
            <input
              type="number"
              min={5}
              max={50}
              value={gif.fps}
              onChange={(e) => setGif({ ...gif, fps: Number(e.target.value) })}
            />
          </label>
          <label>
            Width (px)
            <input
              type="number"
              min={120}
              max={1280}
              step={10}
              value={gif.width}
              onChange={(e) => setGif({ ...gif, width: Number(e.target.value) })}
            />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={gif.dither}
              onChange={(e) => setGif({ ...gif, dither: e.target.checked })}
            />
            Dithering (smoother gradients)
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={gif.loop}
              onChange={(e) => setGif({ ...gif, loop: e.target.checked })}
            />
            Loop forever
          </label>
        </div>
      ) : (
        <div className="options">
          <label>
            Quality (CRF: lower = better)
            <input
              type="number"
              min={0}
              max={51}
              value={mp4.crf}
              onChange={(e) => setMp4({ ...mp4, crf: Number(e.target.value) })}
            />
          </label>
          <label>
            Max width (px, blank = original)
            <input
              type="number"
              min={120}
              max={3840}
              step={10}
              value={mp4.maxWidth ?? ''}
              onChange={(e) =>
                setMp4({ ...mp4, maxWidth: e.target.value === '' ? null : Number(e.target.value) })
              }
            />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={mp4.includeAudio}
              onChange={(e) => setMp4({ ...mp4, includeAudio: e.target.checked })}
            />
            Include audio
          </label>
        </div>
      )}

      {longGif && (
        <p className="hint warn">
          Heads up: GIFs longer than ~15s get large and slow to encode in the browser.
          Consider a shorter clip, lower FPS/width, or export MP4.
        </p>
      )}

      <button className="primary" onClick={onExport} disabled={ffmpeg.busy || clipDuration <= 0}>
        {ffmpeg.busy ? 'Working…' : `Export ${format.toUpperCase()}`}
      </button>

      {ffmpeg.busy && (
        <div className="progress-line">
          <span>{ffmpeg.status}</span>
          <progress max={1} value={ffmpeg.progress} />
        </div>
      )}
      {ffmpeg.error && <p className="error">{ffmpeg.error}</p>}

      {result && (
        <div className="result">
          <p>
            ✅ <strong>{result.name}</strong> — {(result.size / 1_000_000).toFixed(2)} MB
          </p>
          {result.name.endsWith('.gif') ? (
            <img src={result.url} alt="Exported GIF preview" />
          ) : (
            <video src={result.url} controls loop />
          )}
          <a className="primary download" href={result.url} download={result.name}>
            Download
          </a>
        </div>
      )}
    </section>
  );
}

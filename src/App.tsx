import { useEffect, useState } from 'react';
import { SourceDialog } from './components/SourceDialog';
import { VideoEditor } from './components/VideoEditor';
import { ExportPanel } from './components/ExportPanel';
import { useFfmpeg } from './hooks/useFfmpeg';
import type { VideoSource } from './types';

export function App() {
  const [source, setSource] = useState<VideoSource | null>(null);
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const ffmpeg = useFfmpeg();

  // Warm the encoder in the background once a video is loaded.
  useEffect(() => {
    if (source) ffmpeg.preload();
  }, [source, ffmpeg]);

  function loadSource(next: VideoSource) {
    setSource((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return next;
    });
    setDuration(0);
    setStart(0);
    setEnd(0);
  }

  function clearSource() {
    setSource((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
    setDuration(0);
    setStart(0);
    setEnd(0);
  }

  function onDuration(d: number) {
    setDuration(d);
    setStart(0);
    setEnd(d);
  }

  return (
    <div className="app">
      <header>
        <h1>🎬 VideoClip</h1>
        <p className="tagline">
          Trim a video into a looping GIF or MP4 — entirely in your browser. Nothing is uploaded.
        </p>
      </header>

      {!source && <SourceDialog onLoaded={loadSource} />}

      {source && (
        <>
          <div className="editing-bar">
            <button type="button" className="back-button" onClick={clearSource}>
              ← Choose another video
            </button>
            <p className="filename">Editing: {source.name}</p>
          </div>
          <VideoEditor
            source={source}
            duration={duration}
            start={start}
            end={end}
            onDuration={onDuration}
            onChangeStart={setStart}
            onChangeEnd={setEnd}
          />
          <ExportPanel source={source} start={start} end={end} ffmpeg={ffmpeg} />
        </>
      )}

      <footer>
        <a href="#/privacy">Privacy</a>
        <span aria-hidden>·</span>
        <a href="#/terms">Terms</a>
        <span aria-hidden>·</span>
        <span>100% client-side · nothing is uploaded</span>
        <span aria-hidden>·</span>
        <a
          className="github-link"
          href="https://github.com/psigen/videoclip"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View source on GitHub"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.605-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222 0 1.606-.014 2.898-.014 3.293 0 .322.216.694.825.576C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
          </svg>
        </a>
      </footer>
    </div>
  );
}

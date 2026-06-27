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

      <SourceDialog onLoaded={loadSource} />

      {source && (
        <>
          <p className="filename">Editing: {source.name}</p>
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
      </footer>
    </div>
  );
}

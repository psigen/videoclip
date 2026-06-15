import { useEffect, useRef, useState } from 'react';
import { Timeline } from './Timeline';
import { clamp, formatTime, parseTime } from '../lib/time';
import type { VideoSource } from '../types';

interface Props {
  source: VideoSource;
  duration: number;
  start: number;
  end: number;
  onDuration: (d: number) => void;
  onChangeStart: (t: number) => void;
  onChangeEnd: (t: number) => void;
}

export function VideoEditor({
  source,
  duration,
  start,
  end,
  onDuration,
  onChangeStart,
  onChangeEnd,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [current, setCurrent] = useState(0);
  const [loopSel, setLoopSel] = useState(true);
  // Local text buffers so users can type a partial timecode without it being clobbered.
  const [startText, setStartText] = useState(formatTime(start));
  const [endText, setEndText] = useState(formatTime(end));

  useEffect(() => setStartText(formatTime(start)), [start]);
  useEffect(() => setEndText(formatTime(end)), [end]);

  function seek(t: number) {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = clamp(t, 0, duration || v.duration || 0);
  }

  function playSelection() {
    const v = videoRef.current;
    if (!v) return;
    if (current < start || current >= end) v.currentTime = start;
    void v.play();
  }

  return (
    <section className="card editor">
      <video
        ref={videoRef}
        src={source.url}
        controls
        onLoadedMetadata={(e) => onDuration(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => {
          const t = e.currentTarget.currentTime;
          setCurrent(t);
          if (loopSel && t >= end) {
            e.currentTarget.currentTime = start;
          }
        }}
      />

      <Timeline
        duration={duration}
        start={start}
        end={end}
        current={current}
        onChangeStart={onChangeStart}
        onChangeEnd={onChangeEnd}
        onScrub={seek}
      />

      <div className="controls">
        <button onClick={playSelection}>▶ Play selection</button>
        <label className="checkbox">
          <input type="checkbox" checked={loopSel} onChange={(e) => setLoopSel(e.target.checked)} />
          Loop
        </label>

        <div className="field">
          <label>Start</label>
          <input
            value={startText}
            onChange={(e) => setStartText(e.target.value)}
            onBlur={() => {
              const t = parseTime(startText);
              if (t !== null) onChangeStart(clamp(t, 0, end - 0.05));
              else setStartText(formatTime(start));
            }}
          />
          <button className="link" onClick={() => onChangeStart(clamp(current, 0, end - 0.05))}>
            set to playhead
          </button>
        </div>

        <div className="field">
          <label>End</label>
          <input
            value={endText}
            onChange={(e) => setEndText(e.target.value)}
            onBlur={() => {
              const t = parseTime(endText);
              if (t !== null) onChangeEnd(clamp(t, start + 0.05, duration));
              else setEndText(formatTime(end));
            }}
          />
          <button className="link" onClick={() => onChangeEnd(clamp(current, start + 0.05, duration))}>
            set to playhead
          </button>
        </div>
      </div>
    </section>
  );
}

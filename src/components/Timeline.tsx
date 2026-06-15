import { useCallback, useEffect, useRef, useState } from 'react';
import { clamp } from '../lib/time';

type Drag = 'start' | 'end' | 'playhead' | null;

interface Props {
  duration: number;
  start: number;
  end: number;
  current: number;
  onChangeStart: (t: number) => void;
  onChangeEnd: (t: number) => void;
  onScrub: (t: number) => void;
}

export function Timeline({
  duration,
  start,
  end,
  current,
  onChangeStart,
  onChangeEnd,
  onScrub,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag>(null);

  const pct = (t: number) => (duration > 0 ? clamp(t / duration, 0, 1) * 100 : 0);

  const timeAtClientX = useCallback(
    (clientX: number): number => {
      const el = trackRef.current;
      if (!el || duration <= 0) return 0;
      const rect = el.getBoundingClientRect();
      const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
      return ratio * duration;
    },
    [duration],
  );

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const t = timeAtClientX(e.clientX);
      if (drag === 'start') {
        onChangeStart(Math.min(t, end - 0.05));
      } else if (drag === 'end') {
        onChangeEnd(Math.max(t, start + 0.05));
      } else {
        onScrub(t);
      }
    };
    const up = () => setDrag(null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [drag, end, start, timeAtClientX, onChangeStart, onChangeEnd, onScrub]);

  return (
    <div className="timeline">
      <div
        className="track"
        ref={trackRef}
        onPointerDown={(e) => {
          // Click on empty track moves the playhead.
          if ((e.target as HTMLElement).classList.contains('handle')) return;
          onScrub(timeAtClientX(e.clientX));
        }}
      >
        <div
          className="selection"
          style={{ left: `${pct(start)}%`, right: `${100 - pct(end)}%` }}
        />
        <div className="playhead" style={{ left: `${pct(current)}%` }} />
        <div
          className="handle start"
          style={{ left: `${pct(start)}%` }}
          onPointerDown={() => setDrag('start')}
          role="slider"
          aria-label="Clip start"
          aria-valuenow={start}
          tabIndex={0}
        />
        <div
          className="handle end"
          style={{ left: `${pct(end)}%` }}
          onPointerDown={() => setDrag('end')}
          role="slider"
          aria-label="Clip end"
          aria-valuenow={end}
          tabIndex={0}
        />
      </div>
    </div>
  );
}

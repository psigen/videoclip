import { useEffect, useMemo, useRef, useState } from 'react';
import { Timeline } from './Timeline';
import { CropOverlay } from './CropOverlay';
import { clamp, formatTime, parseTime } from '../lib/time';
import type { CropRegion, VideoSource } from '../types';

interface Props {
  source: VideoSource;
  duration: number;
  start: number;
  end: number;
  crop: CropRegion | null;
  onDuration: (d: number) => void;
  onChangeStart: (t: number) => void;
  onChangeEnd: (t: number) => void;
  onChangeCrop: (c: CropRegion | null) => void;
}

// HTMLVideoElement exposes no source frame rate, so a single-frame step assumes
// 30fps. Good enough for nudging to a nearby frame while scrubbing.
const FRAME_STEP = 1 / 30;

// Playback-speed choices mirroring the browser's native video menu (preview only).
const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

// Aspect ratios for the crop selector, in output-pixel terms (null = freeform).
const RATIOS = { Custom: null, '16:9': 16 / 9, '9:16': 9 / 16, '4:3': 4 / 3, Square: 1 } as const;
type AspectKey = keyof typeof RATIOS;

// Re-fit an existing crop box to a new pixel ratio Rf (already in fraction space),
// anchored on the box's current center so it stays where the user placed it.
function refitToRatio(c: CropRegion, Rf: number): CropRegion {
  const cx = c.x + c.width / 2;
  const cy = c.y + c.height / 2;
  const maxW = Math.min(2 * cx, 2 * (1 - cx));
  const maxH = Math.min(2 * cy, 2 * (1 - cy));
  const w = Math.min(c.width, maxW, maxH * Rf);
  const h = w / Rf;
  return { x: cx - w / 2, y: cy - h / 2, width: w, height: h };
}

export function VideoEditor({
  source,
  duration,
  start,
  end,
  crop,
  onDuration,
  onChangeStart,
  onChangeEnd,
  onChangeCrop,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loopSel, setLoopSel] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [aspect, setAspect] = useState<AspectKey>('Custom');
  // Intrinsic source pixels — needed to convert an output-pixel ratio into the
  // fraction-space ratio the crop box works in.
  const [intrinsic, setIntrinsic] = useState({ w: 0, h: 0 });
  // Local text buffers so users can type a partial timecode without it being clobbered.
  const [startText, setStartText] = useState(formatTime(start));
  const [endText, setEndText] = useState(formatTime(end));

  useEffect(() => setStartText(formatTime(start)), [start]);
  useEffect(() => setEndText(formatTime(end)), [end]);

  // React doesn't reliably reflect the `muted` attribute to the DOM property, so set it directly.
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = true;
  }, [source]);

  // Loading a new source resets playbackRate to 1, so reapply the chosen speed.
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed;
  }, [speed, source]);

  function seek(t: number) {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = clamp(t, 0, duration || v.duration || 0);
  }

  function stepFrame(dir: number) {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    seek(v.currentTime + dir * FRAME_STEP);
  }

  function playSelection() {
    const v = videoRef.current;
    if (!v) return;
    if (current < start || current >= end) v.currentTime = start;
    void v.play();
  }

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) playSelection();
    else v.pause();
  }

  // Keyboard shortcuts: Space = play/pause, ←/→ = single-frame step. Bound once;
  // a ref keeps the handlers current. Ignored while typing in a form control.
  const keysRef = useRef({ togglePlay, stepFrame });
  keysRef.current = { togglePlay, stepFrame };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      // Never hijack typing (timecode/width fields), radios, checkboxes, or selects.
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
      if (e.code === 'Space') {
        // Let a focused button/link activate on Space itself (avoids a double toggle).
        if (tag === 'BUTTON' || tag === 'A') return;
        e.preventDefault();
        keysRef.current.togglePlay();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        keysRef.current.stepFrame(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        keysRef.current.stepFrame(1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // The crop box lives in fraction space; a desired output ratio R = w/h maps to
  // a fraction-space ratio of R * (ih/iw). Null until metadata loads or in Custom.
  const ratioFrac = useMemo(() => {
    const R = RATIOS[aspect];
    if (R == null || !intrinsic.w || !intrinsic.h) return null;
    return R * (intrinsic.h / intrinsic.w);
  }, [aspect, intrinsic]);

  // ~16px minimum box, falling back to 2% before metadata is known.
  const minW = intrinsic.w ? Math.max(0.02, 16 / intrinsic.w) : 0.02;
  const minH = intrinsic.h ? Math.max(0.02, 16 / intrinsic.h) : 0.02;

  function onAspectChange(next: AspectKey) {
    setAspect(next);
    const R = RATIOS[next];
    if (crop && R != null && intrinsic.w && intrinsic.h) {
      onChangeCrop(refitToRatio(crop, R * (intrinsic.h / intrinsic.w)));
    }
  }

  return (
    <section className="card editor">
      <div className="stage">
        <video
          ref={videoRef}
          src={source.url}
          muted
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            onDuration(v.duration || 0);
            setIntrinsic({ w: v.videoWidth, h: v.videoHeight });
          }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            setCurrent(v.currentTime);
            // Loop only during playback — a paused seek (⏭️, frame step, scrub to
            // the end) also fires timeupdate and must not bounce back to start.
            if (loopSel && !v.paused && v.currentTime >= end) {
              v.currentTime = start;
            }
          }}
        />
        <CropOverlay
          crop={crop}
          onChange={onChangeCrop}
          ratioFrac={ratioFrac}
          minW={minW}
          minH={minH}
        />
      </div>

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
        <div className="transport">
          <button className="icon-btn" title="Jump to selection start" onClick={() => seek(start)}>
            ⏮️
          </button>
          <button className="icon-btn" title="Previous frame (←)" onClick={() => stepFrame(-1)}>
            ←
          </button>
          <button className="play-toggle" onClick={togglePlay}>
            {playing ? '⏸ Pause' : '▶ Play selection'}
          </button>
          <button className="icon-btn" title="Next frame (→)" onClick={() => stepFrame(1)}>
            →
          </button>
          <button className="icon-btn" title="Jump to selection end" onClick={() => seek(end)}>
            ⏭️
          </button>
        </div>

        <label className="field">
          <span>Speed</span>
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s === 1 ? 'Normal' : `${s}×`}
              </option>
            ))}
          </select>
        </label>

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

      <div className="controls crop-controls">
        <span className="crop-label">Crop</span>
        <div className="crop-ratios" role="radiogroup" aria-label="Crop aspect ratio">
          {(Object.keys(RATIOS) as AspectKey[]).map((key) => (
            <label key={key} className="radio">
              <input
                type="radio"
                name="crop-aspect"
                checked={aspect === key}
                onChange={() => onAspectChange(key)}
              />
              {key}
            </label>
          ))}
        </div>
        <button className="secondary" onClick={() => onChangeCrop(null)} disabled={!crop}>
          Clear crop
        </button>
      </div>
    </section>
  );
}

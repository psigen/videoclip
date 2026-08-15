import { useEffect, useRef, useState } from 'react';
import { clamp } from '../lib/time';
import type { CropRegion } from '../types';

// What a pointer drag is currently doing: drawing a fresh box, moving it, or
// resizing from one of the 8 handles (corner or edge).
type DragMode = 'new' | 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';

interface DragState {
  mode: DragMode;
  fixedX: number; // the edge/corner X held still during a resize (or draw anchor)
  fixedY: number;
  startBox: CropRegion; // box at pointerdown (move translation, edge perpendicular)
  downFX: number; // pointerdown position as a fraction (move delta)
  downFY: number;
  downClientX: number; // pointerdown pixels (click-vs-drag threshold)
  downClientY: number;
  moved: boolean; // crossed the drag threshold — mutated in place
  hadCrop: boolean; // whether a crop existed at pointerdown (for click-outside-to-clear)
}

interface Props {
  crop: CropRegion | null;
  /** Report a new/updated crop, or null to clear it. */
  onChange: (c: CropRegion | null) => void;
  /** Locked aspect ratio in FRACTION space (width/height), or null for freeform. */
  ratioFrac: number | null;
  minW: number; // minimum box width/height as source fractions
  minH: number;
}

const CORNERS = ['nw', 'ne', 'sw', 'se'] as const;
const EDGES = ['n', 's', 'e', 'w'] as const;
const DRAG_PX = 4;

// Move one edge against a fixed edge, enforcing a minimum size and keeping the
// pair sorted (so dragging past the anchor flips the box instead of inverting it).
function clampEdge(fixed: number, moving: number, min: number): [number, number] {
  const dir = moving >= fixed ? 1 : -1;
  let m = moving;
  if (Math.abs(m - fixed) < min) m = fixed + dir * min;
  m = clamp(m, 0, 1);
  return [Math.min(fixed, m), Math.max(fixed, m)];
}

// Both-axes-free fit that maintains a locked fraction-space ratio Rf = width/height,
// anchored at the fixed corner and capped by the room toward the pointer so it
// never escapes [0,1].
function cornerRatio(
  fixedX: number,
  fixedY: number,
  px: number,
  py: number,
  Rf: number,
  minW: number,
  minH: number,
): CropRegion {
  const dirX = px >= fixedX ? 1 : -1;
  const dirY = py >= fixedY ? 1 : -1;
  let w = Math.max(Math.abs(px - fixedX), Math.abs(py - fixedY) * Rf);
  const availW = dirX > 0 ? 1 - fixedX : fixedX;
  const availH = dirY > 0 ? 1 - fixedY : fixedY;
  const wMax = Math.min(availW, availH * Rf);
  const wMin = Math.max(minW, minH * Rf);
  w = clamp(w, Math.min(wMin, wMax), wMax);
  const h = w / Rf;
  const mvx = fixedX + dirX * w;
  const mvy = fixedY + dirY * h;
  return { x: Math.min(fixedX, mvx), y: Math.min(fixedY, mvy), width: w, height: h };
}

function computeBox(
  d: DragState,
  fx: number,
  fy: number,
  Rf: number | null,
  minW: number,
  minH: number,
): CropRegion {
  const b = d.startBox;

  if (d.mode === 'move') {
    const x = clamp(b.x + (fx - d.downFX), 0, 1 - b.width);
    const y = clamp(b.y + (fy - d.downFY), 0, 1 - b.height);
    return { ...b, x, y };
  }

  const isCorner = d.mode === 'nw' || d.mode === 'ne' || d.mode === 'sw' || d.mode === 'se';

  if (d.mode === 'new' || isCorner) {
    if (Rf != null) return cornerRatio(d.fixedX, d.fixedY, fx, fy, Rf, minW, minH);
    const [L, R] = clampEdge(d.fixedX, fx, minW);
    const [T, B] = clampEdge(d.fixedY, fy, minH);
    return { x: L, y: T, width: R - L, height: B - T };
  }

  // Single-axis edge resize (custom mode only — edges are hidden when Rf != null).
  if (d.mode === 'e' || d.mode === 'w') {
    const [L, R] = clampEdge(d.fixedX, fx, minW);
    return { x: L, y: b.y, width: R - L, height: b.height };
  }
  const [T, B] = clampEdge(d.fixedY, fy, minH);
  return { x: b.x, y: T, width: b.width, height: B - T };
}

export function CropOverlay({ crop, onChange, ratioFrac, minW, minH }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [active, setActive] = useState<DragMode | null>(null);

  // Latest params, read by the window handlers so they never need to re-bind
  // mid-drag (the listeners are attached once per gesture, keyed on `active`).
  const params = useRef({ onChange, ratioFrac, minW, minH });
  params.current = { onChange, ratioFrac, minW, minH };

  function fracAt(clientX: number, clientY: number) {
    const r = ref.current!.getBoundingClientRect();
    return {
      fx: clamp((clientX - r.left) / r.width, 0, 1),
      fy: clamp((clientY - r.top) / r.height, 0, 1),
    };
  }

  function beginDrag(mode: DragMode, e: React.PointerEvent) {
    // Capture the pointer to this element so we are GUARANTEED the terminal
    // pointerup/pointercancel (even if the pointer leaves the window or a native
    // gesture would otherwise steal it) — that missing terminal event is what left
    // the box "stuck" to the cursor. preventDefault stops text-selection from
    // hijacking the drag. Capturing on the gesture's own element also keeps the
    // cursor correct (move/resize/crosshair) for the duration of the drag.
    e.preventDefault();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* setPointerCapture can throw if the pointer is already gone; non-fatal */
    }
    const box = crop ?? { x: 0, y: 0, width: 0, height: 0 };
    const { fx, fy } = fracAt(e.clientX, e.clientY);
    let fixedX = fx;
    let fixedY = fy;
    switch (mode) {
      case 'nw': fixedX = box.x + box.width; fixedY = box.y + box.height; break;
      case 'ne': fixedX = box.x; fixedY = box.y + box.height; break;
      case 'sw': fixedX = box.x + box.width; fixedY = box.y; break;
      case 'se': fixedX = box.x; fixedY = box.y; break;
      case 'e': fixedX = box.x; break; // left edge held
      case 'w': fixedX = box.x + box.width; break; // right edge held
      case 's': fixedY = box.y; break; // top edge held
      case 'n': fixedY = box.y + box.height; break; // bottom edge held
      default: break; // 'new' | 'move' anchor at the pointerdown fraction
    }
    dragRef.current = {
      mode,
      fixedX,
      fixedY,
      startBox: box,
      downFX: fx,
      downFY: fy,
      downClientX: e.clientX,
      downClientY: e.clientY,
      moved: false,
      hadCrop: crop != null,
    };
    setActive(mode);
  }

  function onOverlayDown(e: React.PointerEvent) {
    if (e.target !== e.currentTarget) return; // only the empty/dim area starts a fresh draw
    beginDrag('new', e);
  }

  useEffect(() => {
    if (!active) return;
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      if (!d.moved && Math.hypot(e.clientX - d.downClientX, e.clientY - d.downClientY) > DRAG_PX) {
        d.moved = true;
      }
      if (!d.moved) return; // below threshold: don't create/alter a box
      const { fx, fy } = fracAt(e.clientX, e.clientY);
      const p = params.current;
      p.onChange(computeBox(d, fx, fy, p.ratioFrac, p.minW, p.minH));
    };
    // End the gesture. `cancelled` (from pointercancel) skips the click action so
    // an interrupted gesture never clears the crop; both paths reset drag state.
    const end = (cancelled: boolean) => {
      const d = dragRef.current;
      // A click (no drag) started on the empty area is outside the box: clear the
      // crop if one exists. Clicks inside the box (mode 'move') or with no crop do
      // nothing. Handles never reach here as 'new'/'move'.
      if (!cancelled && d && !d.moved && d.mode === 'new' && d.hadCrop) {
        params.current.onChange(null);
      }
      dragRef.current = null;
      setActive(null);
    };
    const up = () => end(false);
    const cancel = () => end(true);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const pct = (n: number) => `${n * 100}%`;
  const handles = ratioFrac == null ? [...CORNERS, ...EDGES] : [...CORNERS];

  return (
    <div
      className={crop ? 'crop-overlay has-crop' : 'crop-overlay'}
      ref={ref}
      onPointerDown={onOverlayDown}
    >
      {crop && (
        <div
          className="crop-selection"
          style={{
            left: pct(crop.x),
            top: pct(crop.y),
            width: pct(crop.width),
            height: pct(crop.height),
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            beginDrag('move', e);
          }}
        >
          {handles.map((h) => (
            <div
              key={h}
              className={`crop-handle h-${h}`}
              onPointerDown={(e) => {
                e.stopPropagation();
                beginDrag(h, e);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

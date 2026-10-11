import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

const MAX_SCALE = 6;

interface View { scale: number; x: number; y: number }
interface Point { x: number; y: number }

/**
 * Pinch / wheel / button zoom and drag-to-pan for content inside a fixed frame.
 * Only the content moves; the page around it stays put.
 */
export function usePanZoom() {
  const frameRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;

  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<{ start: View; mid: Point; dist: number } | null>(null);
  const moved = useRef(false);

  /** Keep the content covering the frame so it can't be dragged off-screen. */
  const clamp = useCallback((v: View): View => {
    const frame = frameRef.current;
    if (!frame) return v;
    const scale = Math.min(MAX_SCALE, Math.max(1, v.scale));
    const w = frame.clientWidth, h = frame.clientHeight;
    // The picture can be taller than the frame (tall deck plans), so use its own size.
    const content = frame.firstElementChild as HTMLElement | null;
    const cw = content?.offsetWidth ?? w, ch = content?.offsetHeight ?? h;
    return {
      scale,
      x: Math.min(0, Math.max(w - cw * scale, v.x)),
      y: Math.min(0, Math.max(h - ch * scale, v.y)),
    };
  }, []);

  /** Zoom by `factor`, keeping the point `at` (frame coordinates, default centre) fixed. */
  const zoomBy = useCallback((factor: number, at?: Point) => {
    const frame = frameRef.current;
    if (!frame) return;
    const p = at ?? { x: frame.clientWidth / 2, y: frame.clientHeight / 2 };
    setView(v => {
      const scale = Math.min(MAX_SCALE, Math.max(1, v.scale * factor));
      const k = scale / v.scale;
      return clamp({ scale, x: p.x - (p.x - v.x) * k, y: p.y - (p.y - v.y) * k });
    });
  }, [clamp]);

  const reset = useCallback(() => setView({ scale: 1, x: 0, y: 0 }), []);

  // Mouse wheel zooms toward the cursor (needs a non-passive listener to stop the page scrolling).
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const box = frame.getBoundingClientRect();
      zoomBy(Math.exp(-e.deltaY * 0.0015), { x: e.clientX - box.left, y: e.clientY - box.top });
    };
    frame.addEventListener("wheel", onWheel, { passive: false });
    return () => frame.removeEventListener("wheel", onWheel);
  });

  const local = (e: ReactPointerEvent): Point => {
    const box = frameRef.current!.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  };

  function startGesture() {
    const pts = [...pointers.current.values()];
    const mid = pts.length > 1 ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } : pts[0];
    const dist = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
    gesture.current = { start: viewRef.current, mid, dist };
  }

  const handlers = {
    onPointerDown(e: ReactPointerEvent) {
      if (pointers.current.size === 0) moved.current = false;
      pointers.current.set(e.pointerId, local(e));
      startGesture();
    },
    onPointerMove(e: ReactPointerEvent) {
      if (!pointers.current.has(e.pointerId) || !gesture.current) return;
      pointers.current.set(e.pointerId, local(e));
      const pts = [...pointers.current.values()];
      const g = gesture.current;
      const mid = pts.length > 1 ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } : pts[0];
      if (!moved.current && Math.hypot(mid.x - g.mid.x, mid.y - g.mid.y) < 6 && pts.length < 2) return;
      if (pts.length < 2 && g.start.scale === 1) return; // one finger at normal size: leave it as a tap
      moved.current = true;
      // Keep receiving moves even if the finger slides outside the frame.
      try { frameRef.current!.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
      let scale = g.start.scale;
      if (pts.length > 1 && g.dist > 0) {
        scale = Math.min(MAX_SCALE, Math.max(1, g.start.scale * Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) / g.dist));
      }
      // The content point that was under the fingers stays under the fingers.
      const cx = (g.mid.x - g.start.x) / g.start.scale;
      const cy = (g.mid.y - g.start.y) / g.start.scale;
      setView(clamp({ scale, x: mid.x - cx * scale, y: mid.y - cy * scale }));
    },
    onPointerUp(e: ReactPointerEvent) {
      pointers.current.delete(e.pointerId);
      if (pointers.current.size) startGesture();
      else gesture.current = null;
    },
    onPointerCancel(e: ReactPointerEvent) {
      pointers.current.delete(e.pointerId);
      gesture.current = pointers.current.size ? gesture.current : null;
    },
  };

  return {
    frameRef,
    view,
    handlers,
    zoomBy,
    reset,
    /** True if the last touch was a drag or pinch, so the click that follows should be ignored. */
    wasGesture: () => moved.current,
  };
}

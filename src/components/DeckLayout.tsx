import { useRef, useState, type MouseEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Location } from "../data/types";
import { plural } from "../lib/format";
import { usePanZoom } from "../lib/usePanZoom";
import { Icon } from "./Icon";

interface Props {
  photoUrl: string;
  alt: string;
  locations: Location[];
  /** Pin to highlight (the location page you're on). */
  currentId?: string;
  /** Pin being dragged to a new spot; pins can't be opened meanwhile. */
  movingId?: string | null;
  /** Spot waiting for its "new location" form, shown as a pulsing pin. */
  pending?: { x: number; y: number } | null;
  /** Tap on an empty spot, in 0–1 picture coordinates. Leave out to ignore such taps. */
  onTapSpot?: (x: number, y: number) => void;
  /** Dashed outline while waiting for the user to tap a spot. */
  awaitingTap?: boolean;
}

/** A deck picture with its storage pins, zoomable inside a fixed frame. */
export function DeckLayout({ photoUrl, alt, locations, currentId, movingId, pending, onTapSpot, awaitingTap }: Props) {
  const navigate = useNavigate();
  const zoom = usePanZoom();
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const pointerType = useRef("mouse");
  const inverse = `scale(${1 / zoom.view.scale})`; // keeps pins the same size while zooming

  function tapPicture(e: MouseEvent<HTMLDivElement>) {
    if (zoom.wasGesture()) return; // that was a pinch or drag, not a tap
    if (selected) return setSelected(null); // first tap away just closes the name bubble
    if (!onTapSpot) return;
    const box = e.currentTarget.getBoundingClientRect();
    onTapSpot(clamp((e.clientX - box.left) / box.width), clamp((e.clientY - box.top) / box.height));
  }

  function tapPin(e: MouseEvent, loc: Location) {
    e.stopPropagation();
    if (movingId || zoom.wasGesture()) return;
    // Mouse: hovering already shows the name, so a click opens it.
    // Finger: the first tap shows the name, a second tap opens it.
    if (loc.id !== currentId && (pointerType.current === "mouse" || selected === loc.id)) navigate(`/locations/${loc.id}`);
    else setSelected(loc.id);
  }

  const showLabel = (id: string) => !movingId && (hovered === id || selected === id);

  return (
    <div className={`card plan${awaitingTap ? " moving" : ""}`}>
      <div className={`plan-frame${zoom.view.scale > 1 ? " zoomed" : ""}`} ref={zoom.frameRef}
        {...zoom.handlers}
        onPointerDown={e => { pointerType.current = e.pointerType; zoom.handlers.onPointerDown(e); }}>
        <div className={`plan-canvas${onTapSpot ? " can-add" : ""}`} onClick={tapPicture}
          style={{ transform: `translate(${zoom.view.x}px, ${zoom.view.y}px) scale(${zoom.view.scale})` }}>
          <img src={photoUrl} alt={alt} draggable={false} />
          {locations.map(loc => (
            <div key={loc.id} className={[
              "dot-wrap",
              loc.y < 0.18 && "label-below",
              loc.x < 0.25 && "label-start",
              loc.x > 0.75 && "label-end",
              loc.id === movingId && "is-moving",
              loc.id === currentId && "is-current",
            ].filter(Boolean).join(" ")}
              style={{ left: `${loc.x * 100}%`, top: `${loc.y * 100}%`, transform: inverse }}>
              <button className="dot" style={{ background: loc.color, color: loc.color }}
                aria-label={`${loc.name}, ${plural(loc.itemCount, "item")}${loc.id === currentId ? " (you are here)" : ""}`}
                onPointerDown={e => (pointerType.current = e.pointerType)}
                onPointerEnter={e => e.pointerType === "mouse" && setHovered(loc.id)}
                onPointerLeave={() => setHovered(h => (h === loc.id ? null : h))}
                onFocus={() => setHovered(loc.id)} onBlur={() => setHovered(null)}
                onClick={e => tapPin(e, loc)} />
              {showLabel(loc.id) && (loc.id === currentId ? (
                <span className="dot-label"><span className="dot-label-name">{loc.name}</span><span className="dot-label-count">here</span></span>
              ) : (
                <Link to={`/locations/${loc.id}`} className="dot-label" onClick={e => e.stopPropagation()}>
                  <span className="dot-label-name">{loc.name}</span>
                  <span className="dot-label-count">{plural(loc.itemCount, "item")}</span>
                  <Icon name="chevron-right" size={14} />
                </Link>
              ))}
            </div>
          ))}
          {pending && (
            <div className="dot-wrap" style={{ left: `${pending.x * 100}%`, top: `${pending.y * 100}%`, transform: inverse }}>
              <span className="dot pending" />
            </div>
          )}
        </div>
      </div>
      <div className="zoom-controls">
        <button onClick={() => zoom.zoomBy(1.6)} aria-label="Zoom in">+</button>
        <button onClick={() => zoom.zoomBy(1 / 1.6)} disabled={zoom.view.scale <= 1} aria-label="Zoom out">−</button>
        {zoom.view.scale > 1 && <button onClick={zoom.reset} aria-label="Reset zoom" className="zoom-reset">1×</button>}
      </div>
    </div>
  );
}

const clamp = (n: number) => Math.min(0.99, Math.max(0.01, n));

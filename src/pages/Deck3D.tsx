import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { AppHeader } from "../components/AppHeader";
import { Icon } from "../components/Icon";
import { usePhotoUrl } from "../components/usePhotoUrl";
import * as store from "../data/store";
import type { Deck, Location } from "../data/types";
import { plural } from "../lib/format";
import { useReloadOnReconnect } from "../lib/useOnline";
import { has3DModel } from "../three/boatModels";
import { SaloonScene, type ViewName } from "../three/saloonScene";

/** Walk-around 3D model of a deck, with its storage pins. Loaded only when opened. */
export default function Deck3D() {
  const { deckId } = useParams();
  const [params] = useSearchParams();
  const [deck, setDeck] = useState<Deck | null | undefined>(undefined);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selected, setSelected] = useState<string | null>(params.get("pin"));
  const [view, setView] = useState<ViewName>("forward");
  const [names, setNames] = useState(false);
  const [plan, setPlan] = useState(false);
  const [failed, setFailed] = useState(false);
  const holder = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SaloonScene | null>(null);
  const photo = usePhotoUrl(deck?.photoPath);

  const load = useCallback(async () => {
    const d = await store.getDeck(deckId!);
    setDeck(d ?? null);
    if (d) setLocations(await store.listLocations(d.id));
  }, [deckId]);
  useEffect(() => { load(); }, [load]);
  useReloadOnReconnect(load);

  // Build the 3D scene once the page is on screen.
  const ready = !!deck;
  useEffect(() => {
    if (!ready || !holder.current) return;
    let scene: SaloonScene;
    try {
      scene = new SaloonScene(holder.current);
    } catch {
      setFailed(true); // no WebGL on this device
      return;
    }
    scene.onSelect = setSelected;
    sceneRef.current = scene;
    return () => { scene.dispose(); sceneRef.current = null; };
  }, [ready]);

  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    s.setPins(locations.map(l => ({ id: l.id, name: l.name, color: l.color, x: l.x, y: l.y, itemCount: l.itemCount })));
    if (selected) s.select(selected, true);
    // Only when the pins change; selection is pushed separately below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations, ready]);

  useEffect(() => { sceneRef.current?.setShowNames(names); }, [names, ready]);
  useEffect(() => { sceneRef.current?.setPlanPicture(plan ? photo ?? null : null); }, [plan, photo, ready]);

  if (deck === null || (deck && !has3DModel(deck.id))) return <Navigate to={deckId ? `/decks/${deckId}` : "/"} replace />;

  const pin = locations.find(l => l.id === selected);
  const choose = (v: ViewName) => { setView(v); sceneRef.current?.setView(v); };
  const sorted = [...locations].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="page three-page">
      <AppHeader backTo={`/decks/${deckId}`} title={deck ? `${deck.name} · 3D` : "3D view"}
        subtitle={plural(locations.length, "location")} />

      <div className="three-toolbar">
        <div className="segmented" role="group" aria-label="Viewpoint">
          {([["forward", "Look forward"], ["aft", "Look aft"], ["overhead", "From above"]] as const).map(([v, label]) => (
            <button key={v} className={view === v ? "on" : ""} onClick={() => choose(v)}>{label}</button>
          ))}
        </div>
        <label className="toggle"><input type="checkbox" checked={names} onChange={e => setNames(e.target.checked)} /> Names</label>
        {photo && <label className="toggle"><input type="checkbox" checked={plan} onChange={e => setPlan(e.target.checked)} /> Plan on floor</label>}
      </div>

      <div className="three-stage card">
        {failed ? (
          <div className="empty"><Icon name="alert-triangle" size={40} /><h3>3D isn't available</h3><p>This device's browser can't show 3D graphics.</p></div>
        ) : <div className="three-canvas" ref={holder} />}

        <select className="three-find" value={selected ?? ""} aria-label="Find a storage location"
          onChange={e => { const id = e.target.value || null; setSelected(id); sceneRef.current?.select(id, true); }}>
          <option value="">Find a location…</option>
          {sorted.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>

        {pin ? (
          <div className="three-card">
            <span className="loc-swatch" style={{ background: pin.color }} />
            <span className="grow"><strong>{pin.name}</strong><span className="muted"> · {plural(pin.itemCount, "item")}</span></span>
            <Link className="btn small primary" to={`/locations/${pin.id}`}>Open</Link>
            <button className="icon-btn ghost" aria-label="Close" onClick={() => { setSelected(null); sceneRef.current?.select(null); }}>
              <Icon name="x" size={18} />
            </button>
          </div>
        ) : (
          <p className="three-hint">Drag to look around · pinch or scroll to zoom · tap a pin</p>
        )}
      </div>
    </div>
  );
}

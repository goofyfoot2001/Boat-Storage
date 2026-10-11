import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useUserId } from "../auth";
import { AppHeader } from "../components/AppHeader";
import { Icon } from "../components/Icon";
import { LocationForm } from "../components/LocationForm";
import { NamePhotoForm } from "../components/NamePhotoForm";
import { usePhotoUrl } from "../components/usePhotoUrl";
import * as store from "../data/store";
import type { Boat, Deck, Location } from "../data/types";
import { plural } from "../lib/format";

/** The deck layout with its storage-location pins. Tap + or an empty spot to add a pin there. */
export function DeckPlan() {
  const { deckId } = useParams();
  const userId = useUserId();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const movingId = params.get("move");

  const [deck, setDeck] = useState<Deck | null | undefined>(undefined);
  const [boat, setBoat] = useState<Boat | undefined>();
  const [locations, setLocations] = useState<Location[]>([]);
  const [editingDeck, setEditingDeck] = useState(false);
  const [pending, setPending] = useState<{ x: number; y: number } | null>(null);
  const [placing, setPlacing] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const pointerType = useRef("mouse");
  const photo = usePhotoUrl(deck?.photoPath);

  const load = useCallback(async () => {
    const d = await store.getDeck(deckId!);
    setDeck(d ?? null);
    if (!d) return;
    const [b, locs] = await Promise.all([store.getBoat(d.boatId), store.listLocations(d.id)]);
    setBoat(b);
    setLocations(locs);
  }, [deckId]);

  useEffect(() => { load(); }, [load]);

  if (deck === null) return <Navigate to="/" replace />;
  if (!deck) return null;

  const moving = locations.find(l => l.id === movingId);

  async function tapPlan(e: MouseEvent<HTMLDivElement>) {
    if (selected) return setSelected(null); // first tap away just closes the name bubble
    const box = e.currentTarget.getBoundingClientRect();
    const x = clamp((e.clientX - box.left) / box.width);
    const y = clamp((e.clientY - box.top) / box.height);
    if (moving) {
      setLocations(ls => ls.map(l => (l.id === moving.id ? { ...l, x, y } : l)));
      setParams({}, { replace: true });
      await store.moveLocation(moving.id, x, y);
    } else {
      setPlacing(false);
      setPending({ x, y });
    }
  }

  function tapDot(e: MouseEvent, loc: Location) {
    e.stopPropagation();
    if (moving) return;
    // Mouse: hovering already shows the name, so a click opens it.
    // Finger: the first tap shows the name, a second tap opens it.
    if (pointerType.current === "mouse" || selected === loc.id) navigate(`/locations/${loc.id}`);
    else setSelected(loc.id);
  }

  const showLabel = (id: string) => !moving && (hovered === id || selected === id);

  return (
    <div className="page">
      <AppHeader backTo={`/boats/${deck.boatId}`} title={deck.name}
        subtitle={[boat?.name, plural(locations.length, "location")].filter(Boolean).join(" · ")}
        right={
          <>
            <button className="icon-btn" onClick={() => setEditingDeck(true)} aria-label="Edit deck">
              <Icon name="edit" size={17} />
            </button>
            {photo && !moving && (
              <button className="icon-btn primary" onClick={() => { setSelected(null); setPlacing(true); }} aria-label="Add pin">
                <Icon name="plus" size={22} />
              </button>
            )}
          </>
        }
      />

      <section className="list">
        {photo ? (
          <>
            {moving || placing ? (
              <div className="hint banner">
                <Icon name="map-pin" size={16} />
                <span className="grow">
                  {moving ? <>Tap the new spot for <strong>{moving.name}</strong></> : "Tap the layout where the new pin goes"}
                </span>
                <button className="btn small" onClick={() => { setPlacing(false); setParams({}, { replace: true }); }}>Cancel</button>
              </div>
            ) : (
              <p className="hint"><Icon name="map-pin" size={14} />
                {locations.length
                  ? "Tap a pin to see what's there. Tap + or an empty spot to add a pin."
                  : "Tap + or anywhere on the layout to add your first storage pin."}
              </p>
            )}

            <div className={`card plan${moving || placing ? " moving" : ""}`}>
              <div className="plan-canvas" onClick={tapPlan} onPointerDown={e => (pointerType.current = e.pointerType)}>
                <img src={photo} alt={`${deck.name} layout`} draggable={false} />
                {locations.map(loc => (
                  <div key={loc.id} className={[
                    "dot-wrap",
                    loc.y < 0.18 && "label-below",
                    loc.x < 0.25 && "label-start",
                    loc.x > 0.75 && "label-end",
                    loc.id === movingId && "is-moving",
                  ].filter(Boolean).join(" ")}
                    style={{ left: `${loc.x * 100}%`, top: `${loc.y * 100}%` }}>
                    <button className="dot" style={{ background: loc.color }} aria-label={`${loc.name}, ${plural(loc.itemCount, "item")}`}
                      onPointerDown={(e: PointerEvent) => (pointerType.current = e.pointerType)}
                      onPointerEnter={(e: PointerEvent) => e.pointerType === "mouse" && setHovered(loc.id)}
                      onPointerLeave={() => setHovered(h => (h === loc.id ? null : h))}
                      onFocus={() => setHovered(loc.id)} onBlur={() => setHovered(null)}
                      onClick={e => tapDot(e, loc)} />
                    {showLabel(loc.id) && (
                      <Link to={`/locations/${loc.id}`} className="dot-label" onClick={e => e.stopPropagation()}>
                        <span className="dot-label-name">{loc.name}</span>
                        <span className="dot-label-count">{plural(loc.itemCount, "item")}</span>
                        <Icon name="chevron-right" size={14} />
                      </Link>
                    )}
                  </div>
                ))}
                {pending && <div className="dot-wrap" style={{ left: `${pending.x * 100}%`, top: `${pending.y * 100}%` }}><span className="dot pending" /></div>}
              </div>
            </div>

            {locations.length > 0 && (
              <>
                <h2 className="section-title">Storage locations</h2>
                <div className="card">
                  {locations.map(loc => (
                    <Link key={loc.id} to={`/locations/${loc.id}`} className="loc-row">
                      <span className="loc-swatch" style={{ background: loc.color }} />
                      <span className="grow">{loc.name}</span>
                      <span className="muted">{plural(loc.itemCount, "item")}</span>
                      <Icon name="chevron-right" size={16} color="var(--muted)" />
                    </Link>
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <div className="empty">
            <Icon name="layers" size={48} />
            <h3>No layout picture</h3>
            <p>Add the deck diagram from your boat's manufacturer, or a photo of a hand-drawn layout. Then you can drop storage pins on it.</p>
            <button className="btn primary" onClick={() => setEditingDeck(true)}><Icon name="camera" size={18} /> Add layout</button>
          </div>
        )}
      </section>

      {pending && (
        <LocationForm title="New storage pin" submitLabel="Add pin"
          onSubmit={async (f, p) => {
            const loc = await store.addLocation(userId, deck.id, pending.x, pending.y, f, p ?? null);
            navigate(`/locations/${loc.id}`);
          }}
          onClose={() => setPending(null)} />
      )}

      {editingDeck && (
        <NamePhotoForm title="Edit deck" nameLabel="Deck name" namePlaceholder="e.g. Main Deck"
          photoLabel="Deck layout" photoHint="The manufacturer's deck diagram works best"
          submitLabel="Save changes" initialName={deck.name} initialPhotoPath={deck.photoPath}
          onSubmit={async (name, p) => { await store.updateDeck(deck, name, p); await load(); }}
          onClose={() => setEditingDeck(false)} />
      )}
    </div>
  );
}

const clamp = (n: number) => Math.min(0.99, Math.max(0.01, n));

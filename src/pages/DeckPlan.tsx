import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useUserId } from "../auth";
import { AppHeader } from "../components/AppHeader";
import { DeckLayout } from "../components/DeckLayout";
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

  async function tapSpot(x: number, y: number) {
    if (moving) {
      setLocations(ls => ls.map(l => (l.id === moving.id ? { ...l, x, y } : l)));
      setParams({}, { replace: true });
      await store.moveLocation(moving.id, x, y);
    } else {
      setPlacing(false);
      setPending({ x, y });
    }
  }

  return (
    <div className="page">
      <AppHeader backTo={`/boats/${deck.boatId}`} title={deck.name}
        subtitle={[boat?.name, plural(locations.length, "location")].filter(Boolean).join(" · ")}
        right={
          <>
            <Link className="icon-btn" to={`/boats/${deck.boatId}/search`} aria-label="Search this boat">
              <Icon name="search" size={18} />
            </Link>
            <button className="icon-btn" onClick={() => setEditingDeck(true)} aria-label="Edit deck">
              <Icon name="edit" size={17} />
            </button>
          </>
        }
      />

      <section className="list">
        {photo ? (
          <>
            {!moving && !placing && (
              <button className="btn primary block" onClick={() => setPlacing(true)}>
                <Icon name="plus" size={18} /> Add location
              </button>
            )}
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
                  ? "Tap a pin to see what's there. Pinch or use + / − to zoom."
                  : "Tap Add location, then tap the spot on the layout."}
              </p>
            )}

            <DeckLayout photoUrl={photo} alt={`${deck.name} layout`} locations={locations}
              movingId={movingId} pending={pending} onTapSpot={tapSpot} awaitingTap={!!moving || placing} />

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

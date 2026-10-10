import { useCallback, useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { AppHeader } from "../components/AppHeader";
import { Icon } from "../components/Icon";
import { ItemForm } from "../components/ItemForm";
import { usePhotoUrl } from "../components/usePhotoUrl";
import * as store from "../data/store";
import type { Boat, Deck } from "../data/types";

/** The deck layout. Storage-location dots will be placed on this picture next. */
export function DeckPlan() {
  const { deckId } = useParams();
  const [deck, setDeck] = useState<Deck | null | undefined>(undefined);
  const [boat, setBoat] = useState<Boat | undefined>();
  const [editing, setEditing] = useState(false);
  const photo = usePhotoUrl(deck?.photoPath);

  const load = useCallback(async () => {
    const d = await store.getDeck(deckId!);
    setDeck(d ?? null);
    if (d) setBoat(await store.getBoat(d.boatId));
  }, [deckId]);

  useEffect(() => { load(); }, [load]);

  if (deck === null) return <Navigate to="/" replace />;
  if (!deck) return null;

  return (
    <div className="page">
      <AppHeader backTo={`/boats/${deck.boatId}`} title={deck.name} subtitle={boat?.name ?? ""}
        right={
          <button className="icon-btn" onClick={() => setEditing(true)} aria-label="Edit deck">
            <Icon name="edit" size={17} />
          </button>
        }
      />

      <section className="list">
        {photo ? (
          <div className="card plan">
            <img src={photo} alt={`${deck.name} layout`} />
          </div>
        ) : (
          <div className="empty">
            <Icon name="layers" size={48} />
            <h3>No layout picture</h3>
            <p>Add the deck diagram from your boat's manufacturer, or a photo of a hand-drawn layout.</p>
            <button className="btn primary" onClick={() => setEditing(true)}><Icon name="camera" size={18} /> Add layout</button>
          </div>
        )}
        <p className="hint centered"><Icon name="map-pin" size={14} /> Storage locations are coming next.</p>
      </section>

      {editing && (
        <ItemForm title="Edit deck" nameLabel="Deck name" namePlaceholder="e.g. Main Deck"
          photoLabel="Deck layout" photoHint="The manufacturer's deck diagram works best"
          submitLabel="Save changes" initialName={deck.name} initialPhotoPath={deck.photoPath}
          onSubmit={async (name, p) => { await store.updateDeck(deck, name, p); await load(); }}
          onClose={() => setEditing(false)} />
      )}
    </div>
  );
}

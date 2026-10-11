import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useUserId } from "../auth";
import { AppHeader } from "../components/AppHeader";
import { ConfirmDelete } from "../components/ConfirmDelete";
import { DeckLayout } from "../components/DeckLayout";
import { Icon } from "../components/Icon";
import { Linkify } from "../components/Linkify";
import { LocationForm } from "../components/LocationForm";
import { StoredItemForm } from "../components/StoredItemForm";
import { usePhotoUrl } from "../components/usePhotoUrl";
import * as store from "../data/store";
import type { Deck, Item, Location } from "../data/types";
import { formatPrice, plural } from "../lib/format";
import type { Place } from "../lib/search";

/** One storage location and everything stored there. */
export function LocationPage() {
  const { locationId } = useParams();
  const userId = useUserId();
  const navigate = useNavigate();
  const [loc, setLoc] = useState<Location | null | undefined>(undefined);
  const [deck, setDeck] = useState<Deck | undefined>();
  const [items, setItems] = useState<Item[]>([]);
  const [editingLoc, setEditingLoc] = useState(false);
  const [deletingLoc, setDeletingLoc] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [deleting, setDeleting] = useState<Item | null>(null);
  const [deckPins, setDeckPins] = useState<Location[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [params] = useSearchParams();
  const focusItemId = params.get("item"); // arriving from a search result
  const photo = usePhotoUrl(loc?.photoPath);
  const deckPhoto = usePhotoUrl(deck?.photoPath);

  const load = useCallback(async () => {
    const l = await store.getLocation(locationId!);
    setLoc(l ?? null);
    if (!l) return;
    const [d, list, pins] = await Promise.all([store.getDeck(l.deckId), store.listItems(l.id), store.listLocations(l.deckId)]);
    setDeck(d);
    setItems(list);
    setDeckPins(pins);
  }, [locationId]);

  useEffect(() => { load(); }, [load]);

  // Every location on this boat, for the "Stored at" choice when editing an item.
  useEffect(() => {
    if (editing && deck && !places.length) store.boatContents(deck.boatId).then(c => setPlaces(c.locations));
  }, [editing, deck, places.length]);

  // Scroll to the item picked in search and flash it.
  useEffect(() => {
    if (!focusItemId || !items.length) return;
    document.getElementById(`item-${focusItemId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusItemId, items]);

  if (loc === null) return <Navigate to="/" replace />;
  if (!loc) return null;

  const total = items.reduce((sum, i) => sum + (i.price ?? 0) * i.quantity, 0);
  const subtitle = [deck?.name, plural(items.length, "item"), total > 0 && formatPrice(total)].filter(Boolean).join(" · ");

  return (
    <div className="page">
      {/* Header and deck picture stay put at the top; only the items below scroll. */}
      <div className="sticky-top">
      <AppHeader backTo={`/decks/${loc.deckId}`} title={loc.name} subtitle={subtitle}
        right={
          <>
            {deck && (
              <Link className="icon-btn" to={`/boats/${deck.boatId}/search`} aria-label="Search this boat">
                <Icon name="search" size={18} />
              </Link>
            )}
            <button className="icon-btn" onClick={() => setEditingLoc(true)} aria-label="Edit location">
              <Icon name="edit" size={17} />
            </button>
            <button className="icon-btn primary" onClick={() => setAdding(true)} aria-label="Add item">
              <Icon name="plus" size={22} />
            </button>
          </>
        }
      />
      {deckPhoto && (
        <div className="sticky-layout">
          <DeckLayout photoUrl={deckPhoto} alt={`${deck?.name} layout`} locations={deckPins} currentId={loc.id} />
        </div>
      )}
      </div>

      <section className="list">
        {deckPhoto && deckPins.length > 1 && (
          <p className="hint"><Icon name="map-pin" size={14} /> Tap another pin to jump to that location.</p>
        )}

        {photo && <img className="loc-photo" src={photo} alt={loc.name} style={{ borderColor: loc.color }} />}

        <h2 className="section-title">Stored here</h2>

        {items.length === 0 && (
          <div className="empty">
            <Icon name="map-pin" size={48} />
            <h3>Nothing here yet</h3>
            <p>Add the things you keep in this spot so you can find them later.</p>
            <button className="btn primary" onClick={() => setAdding(true)}><Icon name="plus" size={18} /> Add an item</button>
          </div>
        )}

        {items.map(item => (
          <ItemCard key={item.id} item={item} focused={item.id === focusItemId} onEdit={() => setEditing(item)} />
        ))}
      </section>

      {adding && (
        <StoredItemForm
          onSubmit={async (f, p) => { await store.addItem(userId, loc.id, f, p ?? null); await load(); }}
          onClose={() => setAdding(false)} />
      )}

      {editing && (
        <StoredItemForm item={editing} places={places}
          onSubmit={async (f, p) => { await store.updateItem(editing, f, p); await load(); }}
          onDelete={() => { setDeleting(editing); setEditing(null); }}
          onClose={() => setEditing(null)} />
      )}

      {deleting && (
        <ConfirmDelete title="Delete item?" confirmLabel="Delete item"
          onConfirm={async () => { await store.deleteItem(deleting); await load(); }}
          onClose={() => setDeleting(null)}>
          Permanently delete <strong>“{deleting.name}”</strong>?
        </ConfirmDelete>
      )}

      {editingLoc && (
        <LocationForm title="Edit location" submitLabel="Save changes"
          initial={{ name: loc.name, color: loc.color }} initialPhotoPath={loc.photoPath}
          onSubmit={async (f, p) => { await store.updateLocation(loc, f, p); await load(); }}
          onMove={() => navigate(`/decks/${loc.deckId}?move=${loc.id}`)}
          onDelete={() => { setDeletingLoc(true); setEditingLoc(false); }}
          onClose={() => setEditingLoc(false)} />
      )}

      {deletingLoc && (
        <ConfirmDelete title="Delete location?" confirmLabel="Delete location"
          onConfirm={async () => { await store.deleteLocation(loc); navigate(`/decks/${loc.deckId}`, { replace: true }); }}
          onClose={() => setDeletingLoc(false)}>
          Permanently delete <strong>“{loc.name}”</strong> and the <strong>{plural(items.length, "item")}</strong> stored there?
        </ConfirmDelete>
      )}
    </div>
  );
}

function ItemCard({ item, focused, onEdit }: { item: Item; focused: boolean; onEdit: () => void }) {
  const photo = usePhotoUrl(item.photoPath);
  return (
    // The whole card opens the item; links in the description open the link instead (Linkify stops the tap).
    <div className={`card item-card tappable${focused ? " flash" : ""}`} id={`item-${item.id}`}
      role="button" tabIndex={0} aria-label={`Open ${item.name}`} onClick={onEdit}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onEdit(); } }}>
      {photo && <img className="item-photo" src={photo} alt="" />}
      <div className="item-body">
        <div className="item-head">
          <h3>{item.name}</h3>
          <Icon name="chevron-right" size={18} color="var(--muted)" />
        </div>
        <p className="item-meta">
          <span className="qty">Qty {item.quantity}</span>
          {item.price != null && (
            <span>
              {formatPrice(item.price)} each
              {item.quantity > 1 && <> · {formatPrice(item.price * item.quantity)} total</>}
            </span>
          )}
        </p>
        {item.notes && <p className="item-notes"><Linkify text={item.notes} /></p>}
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useUserId } from "../auth";
import { AppHeader } from "../components/AppHeader";
import { ConfirmDelete } from "../components/ConfirmDelete";
import { Icon } from "../components/Icon";
import { Linkify } from "../components/Linkify";
import { LocationForm } from "../components/LocationForm";
import { StoredItemForm } from "../components/StoredItemForm";
import { usePhotoUrl } from "../components/usePhotoUrl";
import * as store from "../data/store";
import type { Deck, Item, Location } from "../data/types";
import { formatPrice, plural } from "../lib/format";

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
  const photo = usePhotoUrl(loc?.photoPath);

  const load = useCallback(async () => {
    const l = await store.getLocation(locationId!);
    setLoc(l ?? null);
    if (!l) return;
    const [d, list] = await Promise.all([store.getDeck(l.deckId), store.listItems(l.id)]);
    setDeck(d);
    setItems(list);
  }, [locationId]);

  useEffect(() => { load(); }, [load]);

  if (loc === null) return <Navigate to="/" replace />;
  if (!loc) return null;

  const total = items.reduce((sum, i) => sum + (i.price ?? 0) * i.quantity, 0);
  const subtitle = [deck?.name, plural(items.length, "item"), total > 0 && formatPrice(total)].filter(Boolean).join(" · ");

  return (
    <div className="page">
      <AppHeader backTo={`/decks/${loc.deckId}`} title={loc.name} subtitle={subtitle}
        right={
          <>
            <button className="icon-btn" onClick={() => setEditingLoc(true)} aria-label="Edit location">
              <Icon name="edit" size={17} />
            </button>
            <button className="icon-btn primary" onClick={() => setAdding(true)} aria-label="Add item">
              <Icon name="plus" size={22} />
            </button>
          </>
        }
      />

      <section className="list">
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

        {items.map(item => <ItemCard key={item.id} item={item} onEdit={() => setEditing(item)} />)}
      </section>

      {adding && (
        <StoredItemForm
          onSubmit={async (f, p) => { await store.addItem(userId, loc.id, f, p ?? null); await load(); }}
          onClose={() => setAdding(false)} />
      )}

      {editing && (
        <StoredItemForm item={editing}
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

function ItemCard({ item, onEdit }: { item: Item; onEdit: () => void }) {
  const photo = usePhotoUrl(item.photoPath);
  return (
    <div className="card item-card">
      {photo && <img className="item-photo" src={photo} alt="" />}
      <div className="item-body">
        <div className="item-head">
          <h3>{item.name}</h3>
          <button className="icon-btn small" onClick={onEdit} aria-label={`Edit ${item.name}`}><Icon name="edit" size={16} /></button>
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

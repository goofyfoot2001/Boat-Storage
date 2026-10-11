import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useUserId } from "../auth";
import { AppHeader } from "../components/AppHeader";
import { ConfirmDelete } from "../components/ConfirmDelete";
import { ContainerForm } from "../components/ContainerForm";
import { DeckLayout } from "../components/DeckLayout";
import { Icon } from "../components/Icon";
import { Linkify } from "../components/Linkify";
import { LocationForm } from "../components/LocationForm";
import { Sheet } from "../components/Sheet";
import { StoredItemForm } from "../components/StoredItemForm";
import { usePhotoUrl } from "../components/usePhotoUrl";
import * as store from "../data/store";
import type { Container, Deck, Item, Location } from "../data/types";
import { formatPrice, plural } from "../lib/format";
import { buildTargets, containerPath, type Target } from "../lib/places";

/** Where something new is being added: the location itself (null) or a container in it. */
type AddTarget = { containerId: string | null };

/** One storage location and everything stored there, loose or in (nested) containers. */
export function LocationPage() {
  const { locationId } = useParams();
  const userId = useUserId();
  const navigate = useNavigate();
  const [loc, setLoc] = useState<Location | null | undefined>(undefined);
  const [deck, setDeck] = useState<Deck | undefined>();
  const [items, setItems] = useState<Item[]>([]);
  const [containers, setContainers] = useState<Container[]>([]);
  const [deckPins, setDeckPins] = useState<Location[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [choosing, setChoosing] = useState<AddTarget | null>(null);
  const [addingItem, setAddingItem] = useState<AddTarget | null>(null);
  const [addingContainer, setAddingContainer] = useState<AddTarget | null>(null);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [deletingItem, setDeletingItem] = useState<Item | null>(null);
  const [editingContainer, setEditingContainer] = useState<Container | null>(null);
  const [deletingContainer, setDeletingContainer] = useState<Container | null>(null);
  const [editingLoc, setEditingLoc] = useState(false);
  const [deletingLoc, setDeletingLoc] = useState(false);
  const [boatData, setBoatData] = useState<store.BoatContents | null>(null);

  const [params] = useSearchParams();
  const focusItemId = params.get("item"); // arriving from a search result
  const focusContainerId = params.get("container");
  const photo = usePhotoUrl(loc?.photoPath);
  const deckPhoto = usePhotoUrl(deck?.photoPath);

  const load = useCallback(async () => {
    const l = await store.getLocation(locationId!);
    setLoc(l ?? null);
    if (!l) return;
    const [d, list, boxes, pins] = await Promise.all([
      store.getDeck(l.deckId), store.listItems(l.id), store.listContainers(l.id), store.listLocations(l.deckId),
    ]);
    setDeck(d);
    setItems(list);
    setContainers(boxes);
    setDeckPins(pins);
    setBoatData(null); // "Stored in" lists are rebuilt next time they're needed
  }, [locationId]);

  useEffect(() => { load(); }, [load]);

  // Everything on this boat, for the "Stored in" choice when editing an item or container.
  useEffect(() => {
    if ((editingItem || editingContainer) && deck && !boatData) store.boatContents(deck.boatId).then(setBoatData);
  }, [editingItem, editingContainer, deck, boatData]);

  // Arriving from search: open the containers around the item/container, then scroll to it.
  useEffect(() => {
    if (!containers.length && !items.length) return;
    const item = focusItemId ? items.find(i => i.id === focusItemId) : undefined;
    const open = focusContainerId ? containerPath(focusContainerId, containers) : containerPath(item?.containerId ?? null, containers);
    if (open.length) setExpanded(prev => new Set([...prev, ...open.map(c => c.id)]));
    const el = focusItemId ? `item-${focusItemId}` : focusContainerId ? `container-${focusContainerId}` : null;
    if (el) setTimeout(() => document.getElementById(el)?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
  }, [focusItemId, focusContainerId, items, containers]);

  // How many items are in each container, counting containers inside it.
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items) for (const c of containerPath(i.containerId, containers)) m.set(c.id, (m.get(c.id) ?? 0) + 1);
    return m;
  }, [items, containers]);

  if (loc === null) return <Navigate to="/" replace />;
  if (!loc) return null;

  const total = items.reduce((sum, i) => sum + (i.price ?? 0) * i.quantity, 0);
  const subtitle = [deck?.name, plural(items.length, "item"), total > 0 && formatPrice(total)].filter(Boolean).join(" · ");
  const nameOf = (t: AddTarget) => (t.containerId ? containers.find(c => c.id === t.containerId)?.name : loc.name) ?? loc.name;
  const toggle = (id: string) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const targetsFor = (exclude?: Container): Target[] =>
    boatData ? buildTargets(boatData, new Set(exclude ? store.subtree(exclude, boatData.containers).map(c => c.id) : [])) : [];

  /** Containers then loose items directly inside `parentId` (null = directly in the location). A plain
   *  function rather than a component, so cards keep their state (and pictures) between renders. */
  function contents(parentId: string | null) {
    return (
      <>
        {containers.filter(c => c.parentId === parentId).map(c => (
          <ContainerCard key={c.id} container={c} itemCount={counts.get(c.id) ?? 0}
            boxCount={containers.filter(x => x.parentId === c.id).length}
            open={expanded.has(c.id)} focused={c.id === focusContainerId}
            onToggle={() => toggle(c.id)} onEdit={() => setEditingContainer(c)}
            onAddItem={() => setAddingItem({ containerId: c.id })}
            onAddContainer={() => setAddingContainer({ containerId: c.id })}>
            {contents(c.id)}
          </ContainerCard>
        ))}
        {items.filter(i => i.containerId === parentId).map(item => (
          <ItemCard key={item.id} item={item} focused={item.id === focusItemId} onEdit={() => setEditingItem(item)} />
        ))}
      </>
    );
  }

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
            <button className="icon-btn primary" onClick={() => setChoosing({ containerId: null })} aria-label="Add item or container">
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

        {items.length === 0 && containers.length === 0 ? (
          <div className="empty">
            <Icon name="map-pin" size={48} />
            <h3>Nothing here yet</h3>
            <p>Add the things you keep in this spot, or a bin or box to sort them into.</p>
            <div className="row">
              <button className="btn primary" onClick={() => setAddingItem({ containerId: null })}><Icon name="plus" size={18} /> Item</button>
              <button className="btn" onClick={() => setAddingContainer({ containerId: null })}><Icon name="box" size={18} /> Container</button>
            </div>
          </div>
        ) : (
          contents(null)
        )}
      </section>

      {choosing && (
        <Sheet title={`Add to ${nameOf(choosing)}`} onClose={() => setChoosing(null)}>
          <div className="choice">
            <button className="btn primary block" onClick={() => { setAddingItem(choosing); setChoosing(null); }}>
              <Icon name="plus" size={18} /> Item
            </button>
            <button className="btn block" onClick={() => { setAddingContainer(choosing); setChoosing(null); }}>
              <Icon name="box" size={18} /> Container (bin, tote, box)
            </button>
          </div>
        </Sheet>
      )}

      {addingItem && (
        <StoredItemForm insideName={addingItem.containerId ? nameOf(addingItem) : undefined}
          onSubmit={async (f, p, docs) => {
            const itemId = await store.addItem(userId, loc.id, addingItem.containerId, f, p ?? null);
            for (const d of docs) await store.attachDocument(userId, itemId, d);
            if (addingItem.containerId) setExpanded(prev => new Set([...prev, addingItem.containerId!]));
            await load();
          }}
          onClose={() => setAddingItem(null)} />
      )}

      {addingContainer && (
        <ContainerForm insideName={nameOf(addingContainer)}
          onSubmit={async (f, p) => {
            await store.addContainer(userId, loc.id, addingContainer.containerId, f, p ?? null);
            if (addingContainer.containerId) setExpanded(prev => new Set([...prev, addingContainer.containerId!]));
            await load();
          }}
          onClose={() => setAddingContainer(null)} />
      )}

      {editingItem && (
        <StoredItemForm item={editingItem} targets={targetsFor()}
          onSubmit={async (f, p) => { await store.updateItem(editingItem, f, p); await load(); }}
          onDocsChanged={load}
          onDelete={() => { setDeletingItem(editingItem); setEditingItem(null); }}
          onClose={() => setEditingItem(null)} />
      )}

      {deletingItem && (
        <ConfirmDelete title="Delete item?" confirmLabel="Delete item"
          onConfirm={async () => { await store.deleteItem(deletingItem); await load(); }}
          onClose={() => setDeletingItem(null)}>
          Permanently delete <strong>“{deletingItem.name}”</strong>?
        </ConfirmDelete>
      )}

      {editingContainer && (
        <ContainerForm container={editingContainer} targets={targetsFor(editingContainer)}
          onSubmit={async (f, p, moveTo) => {
            await store.updateContainer(editingContainer, f, p);
            if (moveTo) await store.moveContainer(editingContainer, { locationId: moveTo.locationId, parentId: moveTo.containerId }, containers);
            await load();
          }}
          onDelete={() => { setDeletingContainer(editingContainer); setEditingContainer(null); }}
          onClose={() => setEditingContainer(null)} />
      )}

      {deletingContainer && (
        <DeleteContainer container={deletingContainer} itemCount={counts.get(deletingContainer.id) ?? 0}
          boxCount={store.subtree(deletingContainer, containers).length - 1}
          outInto={deletingContainer.parentId ? nameOf({ containerId: deletingContainer.parentId }) : loc.name}
          onDelete={async mode => { await store.deleteContainer(deletingContainer, mode, containers, items); await load(); }}
          onClose={() => setDeletingContainer(null)} />
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
          Permanently delete <strong>“{loc.name}”</strong>, the <strong>{plural(items.length, "item")}</strong>
          {containers.length > 0 && <> and <strong>{plural(containers.length, "container")}</strong></>} stored there?
        </ConfirmDelete>
      )}
    </div>
  );
}

function ContainerCard({ container, itemCount, boxCount, open, focused, onToggle, onEdit, onAddItem, onAddContainer, children }: {
  container: Container;
  itemCount: number;
  boxCount: number;
  open: boolean;
  focused: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onAddItem: () => void;
  onAddContainer: () => void;
  children: ReactNode;
}) {
  const photo = usePhotoUrl(container.photoPath);
  const summary = [plural(itemCount, "item"), boxCount > 0 && plural(boxCount, "container")].filter(Boolean).join(" · ");
  return (
    <div className={`card box-card${open ? " open" : ""}${focused ? " flash" : ""}`} id={`container-${container.id}`}
      style={{ borderLeftColor: container.color }}>
      <div className="box-head">
        <button className="box-toggle" onClick={onToggle} aria-expanded={open} aria-label={`${container.name}, ${summary}`}>
          <Icon name="chevron-right" size={18} />
          <span className="thumb item-thumb" style={{ color: container.color }}>
            {photo ? <img src={photo} alt="" /> : <Icon name="box" size={20} />}
          </span>
          <span className="card-text">
            <h3>{container.name}</h3>
            <p>{summary}</p>
          </span>
        </button>
        <button className="card-edit" onClick={onEdit} aria-label={`Edit ${container.name}`}><Icon name="edit" size={17} /></button>
      </div>
      {open && (
        <div className="box-contents">
          {container.notes && <p className="box-notes"><Linkify text={container.notes} /></p>}
          {children}
          {itemCount === 0 && boxCount === 0 && <p className="muted box-empty">Empty</p>}
          <div className="row box-add">
            <button className="btn small" onClick={onAddItem}><Icon name="plus" size={15} /> Item</button>
            <button className="btn small" onClick={onAddContainer}><Icon name="box" size={15} /> Container</button>
          </div>
        </div>
      )}
    </div>
  );
}

function DeleteContainer({ container, itemCount, boxCount, outInto, onDelete, onClose }: {
  container: Container;
  itemCount: number;
  boxCount: number;
  outInto: string;
  onDelete: (mode: "keep" | "all") => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const empty = itemCount === 0 && boxCount === 0;
  const contents = [itemCount > 0 && plural(itemCount, "item"), boxCount > 0 && plural(boxCount, "container")].filter(Boolean).join(" and ");
  const run = async (mode: "keep" | "all") => { setBusy(true); await onDelete(mode); onClose(); };
  return (
    <Sheet title="Delete container?" onClose={onClose}>
      <div className="confirm">
        <div className="confirm-icon"><Icon name="alert-triangle" size={28} /></div>
        {empty ? (
          <p>Delete the empty container <strong>“{container.name}”</strong>?</p>
        ) : (
          <p><strong>“{container.name}”</strong> holds <strong>{contents}</strong>. What should happen to them?</p>
        )}
        {!empty && (
          <button className="btn primary block" disabled={busy} onClick={() => run("keep")}>
            Keep them: move into {outInto}
          </button>
        )}
        <button className="btn danger block" disabled={busy} onClick={() => run("all")}>
          <Icon name="trash" size={16} /> {empty ? "Delete container" : "Delete container and everything in it"}
        </button>
        <button className="btn block" onClick={onClose}>Cancel</button>
      </div>
    </Sheet>
  );
}

function ItemCard({ item, focused, onEdit }: { item: Item; focused: boolean; onEdit: () => void }) {
  const photo = usePhotoUrl(item.photoPath);
  return (
    // The whole card opens the item; links in the description open the link instead (Linkify stops the tap).
    <div className={`card item-card tappable${focused ? " flash" : ""}`} id={`item-${item.id}`}
      role="button" tabIndex={0} aria-label={`Open ${item.name}`} onClick={onEdit}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onEdit(); } }}>
      <div className="thumb item-thumb">{photo ? <img src={photo} alt="" /> : <Icon name="map-pin" size={18} />}</div>
      <div className="item-body">
        <div className="item-head">
          <h3>{item.name}</h3>
          <Icon name="chevron-right" size={18} color="var(--muted)" />
        </div>
        <p className="item-meta">
          <span className="qty">Qty {item.quantity}</span>
          {item.docs.length > 0 && (
            <span className="doc-count" title={item.docs.map(d => d.name).join("\n")}>
              <Icon name="paperclip" size={13} /> {item.docs.length}
            </span>
          )}
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

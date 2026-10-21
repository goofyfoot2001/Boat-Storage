import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useUserId } from "../auth";
import { useBoatRole } from "../lib/useBoatRole";
import { AppHeader } from "../components/AppHeader";
import { ConfirmDelete } from "../components/ConfirmDelete";
import { Icon } from "../components/Icon";
import { NamePhotoForm } from "../components/NamePhotoForm";
import { OfflineCard } from "../components/OfflineCard";
import * as store from "../data/store";
import { useReloadOnReconnect } from "../lib/useOnline";
import type { Boat, Deck } from "../data/types";
import { plural } from "../lib/format";
import { move } from "../lib/move";

const DECK_FORM = {
  nameLabel: "Deck name",
  namePlaceholder: "e.g. Main Deck, Lower Cabin",
  photoLabel: "Deck layout",
  photoHint: "The manufacturer's deck diagram works best",
};

export function BoatDecks() {
  const { boatId } = useParams();
  const userId = useUserId();
  const navigate = useNavigate();
  const [boat, setBoat] = useState<Boat | null | undefined>(undefined);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [adding, setAdding] = useState(false);
  const [editingBoat, setEditingBoat] = useState(false);
  const [deletingBoat, setDeletingBoat] = useState(false);
  const [editing, setEditing] = useState<Deck | null>(null);
  const [deleting, setDeleting] = useState<Deck | null>(null);
  const [reordering, setReordering] = useState(false);
  const [crewCount, setCrewCount] = useState(0);
  const role = useBoatRole(boatId);
  const editable = store.canEdit(role);
  const isOwner = role === "owner";

  const load = useCallback(async () => {
    const b = await store.getBoat(boatId!);
    setBoat(b ?? null);
    if (!b) return;
    const [list, crew] = await Promise.all([store.listDecks(b.id), store.boatCrew(b.id).catch(() => [])]);
    setDecks(list);
    setCrewCount(crew.length);
  }, [userId, boatId]);

  useEffect(() => { load(); }, [load]);
  useReloadOnReconnect(load);

  if (boat === null) return <Navigate to="/" replace />;
  if (!boat) return null;

  async function reorder(index: number, by: -1 | 1) {
    const next = move(decks, index, by);
    setDecks(next);
    await store.reorderDecks(next);
  }

  return (
    <div className="page">
      <AppHeader backTo="/" title={boat.name} subtitle={`${decks.length} deck${decks.length === 1 ? "" : "s"}`}
        right={reordering ? (
          <button className="btn primary small" onClick={() => setReordering(false)}>Done</button>
        ) : (
          <>
            {editable && decks.length > 1 && (
              <button className="icon-btn" onClick={() => setReordering(true)} aria-label="Reorder decks">
                <Icon name="chevron-down" size={18} />
              </button>
            )}
            {isOwner && <button className="icon-btn" onClick={() => setEditingBoat(true)} aria-label="Edit boat">
              <Icon name="edit" size={17} />
            </button>}
            {editable && <button className="icon-btn primary" onClick={() => setAdding(true)} aria-label="Add deck">
              <Icon name="plus" size={22} />
            </button>}
          </>
        )}
      />

      <section className="list">
        {decks.length > 0 && !reordering && (
          <Link to={`/boats/${boat.id}/search`} className="search-box as-link">
            <Icon name="search" size={18} />
            <span>Search {boat.name}…</span>
          </Link>
        )}

        {!reordering && boat.phoneOnly && (
          <div className="card crew-link">
            <span className="thumb deck-thumb saved"><Icon name="smartphone" size={20} /></span>
            <span className="card-text">
              <h3>Only on this phone</h3>
              <p>Works with no signal. Not backed up or shared.</p>
            </span>
          </div>
        )}

        {!reordering && !boat.phoneOnly && (
          <Link to={`/boats/${boat.id}/crew`} className="card crew-link">
            <span className="thumb deck-thumb"><Icon name="users" size={20} /></span>
            <span className="card-text">
              <h3>Crew</h3>
              <p>{crewCount > 1 ? `${crewCount} people on this boat` : isOwner ? "Invite people to help with this boat" : "Who's on this boat"}</p>
            </span>
            <Icon name="chevron-right" size={18} color="var(--muted)" />
          </Link>
        )}

        {!reordering && !boat.phoneOnly && <OfflineCard boatId={boat.id} boatName={boat.name} />}

        <h2 className="section-title">Decks</h2>
        {reordering && <p className="hint">Use the arrows to change the order, then tap Done.</p>}

        {decks.length === 0 && (
          <div className="empty">
            <Icon name="layers" size={48} />
            <h3>No decks yet</h3>
            {editable ? (
              <>
                <p>Add a deck and upload its layout diagram. That's where you'll mark your storage spots.</p>
                <button className="btn primary" onClick={() => setAdding(true)}><Icon name="plus" size={18} /> Add a deck</button>
              </>
            ) : <p>The owner hasn't added any decks yet.</p>}
          </div>
        )}

        {decks.map((deck, i) => (
          <DeckRow key={deck.id} deck={deck} reordering={reordering}
            isFirst={i === 0} isLast={i === decks.length - 1}
            editable={editable} onEdit={() => setEditing(deck)} onMove={by => reorder(i, by)} />
        ))}
      </section>

      {adding && (
        <NamePhotoForm title="Add a deck" {...DECK_FORM} submitLabel="Add deck"
          onSubmit={async (name, photo) => { await store.addDeck(boat.id, name, photo ?? null, decks.length); await load(); }}
          onClose={() => setAdding(false)} />
      )}

      {editing && (
        <NamePhotoForm title="Edit deck" {...DECK_FORM} submitLabel="Save changes"
          initialName={editing.name} initialPhotoPath={editing.photoPath}
          onSubmit={async (name, photo) => { await store.updateDeck(editing, name, photo); await load(); }}
          onDelete={() => { setDeleting(editing); setEditing(null); }}
          onClose={() => setEditing(null)} />
      )}

      {deleting && (
        <ConfirmDelete title="Delete deck?" confirmLabel="Delete deck"
          onConfirm={async () => { await store.deleteDeck(deleting); await load(); }}
          onClose={() => setDeleting(null)}>
          Permanently delete <strong>“{deleting.name}”</strong> and its layout picture?
        </ConfirmDelete>
      )}

      {editingBoat && (
        <NamePhotoForm title="Edit boat" nameLabel="Boat name" namePlaceholder="e.g. Sea Breeze"
          photoLabel="Boat picture" photoHint="Take a photo or choose one" submitLabel="Save changes"
          initialName={boat.name} initialPhotoPath={boat.photoPath}
          onSubmit={async (name, photo) => { await store.updateBoat(boat, name, photo); await load(); }}
          onDelete={() => { setDeletingBoat(true); setEditingBoat(false); }}
          onClose={() => setEditingBoat(false)} />
      )}

      {deletingBoat && (
        <ConfirmDelete title="Delete boat?" confirmLabel="Delete boat"
          onConfirm={async () => { await store.deleteBoat(boat); navigate("/", { replace: true }); }}
          onClose={() => setDeletingBoat(false)}>
          Permanently delete <strong>“{boat.name}”</strong> and its{" "}
          <strong>{decks.length} deck{decks.length === 1 ? "" : "s"}</strong>?
        </ConfirmDelete>
      )}
    </div>
  );
}

function DeckRow({ deck, reordering, isFirst, isLast, editable, onEdit, onMove }: {
  /** False for view-only crew: no edit button. */
  editable: boolean;
  deck: Deck;
  reordering: boolean;
  isFirst: boolean;
  isLast: boolean;
  onEdit: () => void;
  onMove: (by: -1 | 1) => void;
}) {
  const body = (
    <>
      <div className="thumb deck-thumb"><Icon name="layers" size={20} /></div>
      <div className="card-text">
        <h3>{deck.name}</h3>
        <p>{deck.photoPath ? plural(deck.locationCount, "location") : "No layout picture yet"}</p>
      </div>
    </>
  );

  return (
    <div className="card row-card">
      {reordering ? <div className="row-card-main">{body}</div> : (
        <Link to={`/decks/${deck.id}`} className="row-card-main">
          {body}
          <Icon name="chevron-right" size={18} color="var(--muted)" />
        </Link>
      )}
      {reordering ? (
        <div className="reorder">
          <button className="icon-btn" disabled={isFirst} onClick={() => onMove(-1)} aria-label="Move up"><Icon name="chevron-up" size={18} /></button>
          <button className="icon-btn" disabled={isLast} onClick={() => onMove(1)} aria-label="Move down"><Icon name="chevron-down" size={18} /></button>
        </div>
      ) : (
        editable && <button className="card-edit" onClick={onEdit} aria-label={`Edit ${deck.name}`}><Icon name="edit" size={17} /></button>
      )}
    </div>
  );
}

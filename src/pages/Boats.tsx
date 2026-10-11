import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth, useUserId } from "../auth";
import { AppHeader } from "../components/AppHeader";
import { ConfirmDelete } from "../components/ConfirmDelete";
import { Icon } from "../components/Icon";
import { NamePhotoForm } from "../components/NamePhotoForm";
import { usePhotoUrl } from "../components/usePhotoUrl";
import * as store from "../data/store";
import type { Boat } from "../data/types";
import { move } from "../lib/move";

export function Boats() {
  const userId = useUserId();
  const { session, signOut } = useAuth();
  const [boats, setBoats] = useState<Boat[] | null>(null);
  const [deckCounts, setDeckCounts] = useState<Record<string, number>>({});
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Boat | null>(null);
  const [deleting, setDeleting] = useState<Boat | null>(null);
  const [reordering, setReordering] = useState(false);

  const load = useCallback(async () => {
    const [list, counts] = await Promise.all([store.listBoats(), store.deckCounts()]);
    setBoats(list);
    setDeckCounts(counts);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  async function reorder(index: number, by: -1 | 1) {
    const next = move(boats!, index, by);
    setBoats(next);
    await store.reorderBoats(next);
  }

  return (
    <div className="page">
      <AppHeader
        right={reordering ? (
          <button className="btn primary small" onClick={() => setReordering(false)}>Done</button>
        ) : (
          <>
            {boats && boats.length > 1 && (
              <button className="icon-btn" onClick={() => setReordering(true)} aria-label="Reorder boats">
                <Icon name="chevron-down" size={18} />
              </button>
            )}
            <button className="icon-btn primary" onClick={() => setAdding(true)} aria-label="Add boat">
              <Icon name="plus" size={22} />
            </button>
          </>
        )}
      />

      <section className="list">
        <h2 className="section-title">My Boats</h2>
        {reordering && <p className="hint">Use the arrows to change the order, then tap Done.</p>}

        {boats?.length === 0 && (
          <div className="empty">
            <Icon name="anchor" size={48} />
            <h3>No boats yet</h3>
            <p>Add your first boat to start mapping where everything is stored.</p>
            <button className="btn primary" onClick={() => setAdding(true)}><Icon name="plus" size={18} /> Add a boat</button>
          </div>
        )}

        {boats?.map((boat, i) => (
          <BoatCard key={boat.id} boat={boat} deckCount={deckCounts[boat.id] ?? 0}
            reordering={reordering} isFirst={i === 0} isLast={i === boats.length - 1}
            onEdit={() => setEditing(boat)} onMove={by => reorder(i, by)} />
        ))}
      </section>

      <footer className="account">
        <span>Signed in as {session?.email}</span>
        <button className="btn link small" onClick={signOut}><Icon name="log-out" size={16} /> Sign out</button>
        <span className="version">Version {__BUILD__}</span>
      </footer>

      {adding && (
        <NamePhotoForm title="Add a boat" nameLabel="Boat name" namePlaceholder="e.g. Sea Breeze"
          photoLabel="Boat picture" photoHint="Take a photo or choose one" submitLabel="Add boat"
          onSubmit={async (name, photo) => { await store.addBoat(userId, name, photo ?? null, boats?.length ?? 0); await load(); }}
          onClose={() => setAdding(false)} />
      )}

      {editing && (
        <NamePhotoForm title="Edit boat" nameLabel="Boat name" namePlaceholder="e.g. Sea Breeze"
          photoLabel="Boat picture" photoHint="Take a photo or choose one" submitLabel="Save changes"
          initialName={editing.name} initialPhotoPath={editing.photoPath}
          onSubmit={async (name, photo) => { await store.updateBoat(editing, name, photo); await load(); }}
          onDelete={() => { setDeleting(editing); setEditing(null); }}
          onClose={() => setEditing(null)} />
      )}

      {deleting && (
        <ConfirmDelete title="Delete boat?" confirmLabel="Delete boat"
          onConfirm={async () => { await store.deleteBoat(deleting); await load(); }}
          onClose={() => setDeleting(null)}>
          Permanently delete <strong>“{deleting.name}”</strong> and its{" "}
          <strong>{deckCounts[deleting.id] ?? 0} deck{deckCounts[deleting.id] === 1 ? "" : "s"}</strong>?
        </ConfirmDelete>
      )}
    </div>
  );
}

function BoatCard({ boat, deckCount, reordering, isFirst, isLast, onEdit, onMove }: {
  boat: Boat;
  deckCount: number;
  reordering: boolean;
  isFirst: boolean;
  isLast: boolean;
  onEdit: () => void;
  onMove: (by: -1 | 1) => void;
}) {
  const photo = usePhotoUrl(boat.photoPath);
  const body = (
    <>
      <div className="thumb boat-thumb">
        {photo ? <img src={photo} alt="" /> : <Icon name="anchor" size={30} />}
      </div>
      <div className="card-text">
        <h3>{boat.name}</h3>
        <p>{deckCount} deck{deckCount === 1 ? "" : "s"}</p>
      </div>
    </>
  );

  return (
    <div className="card row-card">
      {reordering ? <div className="row-card-main">{body}</div> : (
        <Link to={`/boats/${boat.id}`} className="row-card-main">
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
        <button className="card-edit" onClick={onEdit} aria-label={`Edit ${boat.name}`}><Icon name="edit" size={17} /></button>
      )}
    </div>
  );
}

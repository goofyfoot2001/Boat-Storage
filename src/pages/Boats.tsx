import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth, useUserId } from "../auth";
import { AppHeader } from "../components/AppHeader";
import { ConfirmDelete } from "../components/ConfirmDelete";
import { Icon } from "../components/Icon";
import { NamePhotoForm } from "../components/NamePhotoForm";
import { NewPasswordForm } from "../components/NewPasswordForm";
import { Sheet } from "../components/Sheet";
import { usePhotoUrl } from "../components/usePhotoUrl";
import * as store from "../data/store";
import type { Boat } from "../data/types";
import { mayLoseSavedData } from "../lib/device";
import { move } from "../lib/move";
import { useOnline, useReloadOnReconnect } from "../lib/useOnline";

export function Boats() {
  const userId = useUserId();
  const { session, signOut } = useAuth();
  const online = useOnline(); // cloud boats need a connection to add or change; phone-only boats don't
  const [boats, setBoats] = useState<Boat[] | null>(null);
  const [deckCounts, setDeckCounts] = useState<Record<string, number>>({});
  const [adding, setAdding] = useState(false);
  const [home, setHome] = useState<store.BoatHome>("cloud");
  const [editing, setEditing] = useState<Boat | null>(null);
  const [deleting, setDeleting] = useState<Boat | null>(null);
  const [reordering, setReordering] = useState(false);
  const [roles, setRoles] = useState<Record<string, store.BoatRole>>({});
  const [invites, setInvites] = useState<Awaited<ReturnType<typeof store.myInvites>>>([]);
  const [inviteError, setInviteError] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordChanged, setPasswordChanged] = useState(false);

  const load = useCallback(async () => {
    const [list, counts, mine, waiting] = await Promise.all([
      store.listBoats(), store.deckCounts(), store.myRoles(userId), store.myInvites(session?.email ?? "").catch(() => []),
    ]);
    setBoats(list);
    setDeckCounts(counts);
    setRoles(mine);
    setInvites(waiting.filter(w => w.info?.status === "pending"));
  }, [userId, session?.email]);

  useEffect(() => { load(); }, [load]);
  useReloadOnReconnect(load);

  // Your own boats first (you can reorder those); boats others shared with you after.
  const owned = boats?.filter(b => roles[b.id] === "owner") ?? [];
  const shared = boats?.filter(b => roles[b.id] && roles[b.id] !== "owner") ?? [];

  function startAdding() {
    setHome("cloud");
    setAdding(true);
  }

  async function reorder(index: number, by: -1 | 1) {
    const next = move(owned, index, by);
    setBoats([...next, ...shared]);
    await store.reorderBoats(next);
  }

  async function join(token: string) {
    setInviteError("");
    try {
      await store.acceptInvite(token);
      await load();
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Couldn't accept the invite.");
    }
  }

  return (
    <div className="page">
      <AppHeader
        right={reordering ? (
          <button className="btn primary small" onClick={() => setReordering(false)}>Done</button>
        ) : (
          <>
            {online && owned.length > 1 && (
              <button className="icon-btn" onClick={() => setReordering(true)} aria-label="Reorder boats">
                <Icon name="chevron-down" size={18} />
              </button>
            )}
            <button className="icon-btn primary" onClick={startAdding} aria-label="Add boat">
              <Icon name="plus" size={22} />
            </button>
          </>
        )}
      />

      <section className="list">
        {invites.length > 0 && !reordering && (
          <>
            <h2 className="section-title">Invitations</h2>
            {invites.map(({ invite, info }) => (
              <div key={invite.id} className="card invite-card">
                <Icon name="users" size={22} />
                <p className="grow">
                  {info?.invitedBy ? <><strong>{info.invitedBy}</strong> invited you to </> : "You're invited to "}
                  <strong>{info?.boatName}</strong> as {invite.role === "crew" ? "crew" : "a viewer"}.
                </p>
                <div className="row">
                  <button className="btn small" onClick={async () => { await store.declineInvite(invite.id); await load(); }}>Decline</button>
                  <button className="btn primary small" onClick={() => join(invite.token)}>Join</button>
                </div>
              </div>
            ))}
            {inviteError && <p className="error">{inviteError}</p>}
          </>
        )}

        <h2 className="section-title">My Boats</h2>
        {reordering && <p className="hint">Use the arrows to change the order, then tap Done.</p>}

        {boats && owned.length === 0 && (
          <div className="empty">
            <Icon name="anchor" size={48} />
            <h3>{online ? "No boats of your own yet" : "No boats saved on this phone"}</h3>
            <p>{online ? "Add your first boat to start mapping where everything is stored."
              : "When you have signal, open a boat and use Offline → Save to this phone. Or add a boat that's kept only on this phone."}</p>
            <button className="btn primary" onClick={startAdding}><Icon name="plus" size={18} /> Add a boat</button>
          </div>
        )}

        {owned.map((boat, i) => (
          <BoatCard key={boat.id} boat={boat} deckCount={deckCounts[boat.id] ?? 0}
            badge={boat.phoneOnly ? "On this phone" : undefined}
            reordering={reordering} isFirst={i === 0} isLast={i === owned.length - 1}
            onEdit={online || boat.phoneOnly ? () => setEditing(boat) : undefined} onMove={by => reorder(i, by)} />
        ))}

        {shared.length > 0 && !reordering && (
          <>
            <h2 className="section-title">Shared with me</h2>
            {shared.map(boat => (
              <BoatCard key={boat.id} boat={boat} deckCount={deckCounts[boat.id] ?? 0}
                badge={roles[boat.id] === "crew" ? "Crew" : "View only"}
                reordering={false} isFirst isLast onMove={() => {}} />
            ))}
          </>
        )}
      </section>

      <footer className="account">
        <span>Signed in as {session?.email}</span>
        <span className="row">
          {online && <button className="btn link small" onClick={() => setChangingPassword(true)}>Change password</button>}
          <button className="btn link small" onClick={signOut}><Icon name="log-out" size={16} /> Sign out</button>
        </span>
        <span className="version">Version {__BUILD__}</span>
      </footer>

      {changingPassword && (
        <Sheet title={passwordChanged ? "Password changed" : "Change password"} onClose={() => { setChangingPassword(false); setPasswordChanged(false); }}>
          {passwordChanged ? (
            <div className="form">
              <p>Your new password is saved. Use it next time you sign in.</p>
              <button className="btn primary block" onClick={() => { setChangingPassword(false); setPasswordChanged(false); }}>Done</button>
            </div>
          ) : (
            <NewPasswordForm onDone={() => setPasswordChanged(true)} onCancel={() => setChangingPassword(false)} />
          )}
        </Sheet>
      )}

      {adding && (
        <NamePhotoForm title="Add a boat" nameLabel="Boat name" namePlaceholder="e.g. Sea Breeze"
          photoLabel="Boat picture" photoHint="Take a photo or choose one" submitLabel="Add boat"
          onSubmit={async (name, photo) => { await store.addBoat(name, photo ?? null, boats?.length ?? 0, online ? home : "phone", userId); await load(); }}
          onClose={() => setAdding(false)}>
          <BoatHomeField value={online ? home : "phone"} onChange={setHome} online={online} />
        </NamePhotoForm>
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

/** Asked once, when a boat is added: kept in the cloud, or only on this phone. */
function BoatHomeField({ value, onChange, online }: { value: store.BoatHome; onChange: (h: store.BoatHome) => void; online: boolean }) {
  return (
    <div className="field">
      <span>Where to keep this boat</span>
      <label className={`role-option${value === "cloud" ? " on" : ""}${online ? "" : " disabled"}`}>
        <input type="radio" name="boat-home" checked={value === "cloud"} disabled={!online} onChange={() => onChange("cloud")} />
        <span>
          <strong><Icon name="cloud" size={15} /> Cloud</strong>
          <small>{online ? "Backed up, on all your devices, and you can invite crew. Changes need signal; you can still save a copy to look at offline."
            : "Needs a connection to add."}</small>
        </span>
      </label>
      <label className={`role-option${value === "phone" ? " on" : ""}`}>
        <input type="radio" name="boat-home" checked={value === "phone"} onChange={() => onChange("phone")} />
        <span>
          <strong><Icon name="smartphone" size={15} /> Only on this phone</strong>
          <small>Works fully with no signal: add and change anything, anywhere. Not backed up and can't be shared,
            so if this phone is lost or the app's data is cleared, the boat is gone.</small>
        </span>
      </label>
      {value === "phone" && mayLoseSavedData && (
        <p className="hint warning">
          <Icon name="alert-triangle" size={14} />
          <span>
            On iPhone, add this site to your Home Screen first (Share → Add to Home Screen) and open it from there.
            In a Safari tab, the boat can be wiped if you don't open the site for about a week.
          </span>
        </p>
      )}
      <span className="field-hint">This can't be changed later.</span>
    </div>
  );
}

function BoatCard({ boat, deckCount, badge, reordering, isFirst, isLast, onEdit, onMove }: {
  boat: Boat;
  deckCount: number;
  /** For boats shared with you: your role on it. For phone-only boats: "On this phone". */
  badge?: string;
  reordering: boolean;
  isFirst: boolean;
  isLast: boolean;
  /** Only the owner can edit a boat; left out for shared boats. */
  onEdit?: () => void;
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
        <p>
          {deckCount} deck{deckCount === 1 ? "" : "s"}
          {badge && <span className="role-badge">{badge}</span>}
        </p>
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
      ) : onEdit && (
        <button className="card-edit" onClick={onEdit} aria-label={`Edit ${boat.name}`}><Icon name="edit" size={17} /></button>
      )}
    </div>
  );
}

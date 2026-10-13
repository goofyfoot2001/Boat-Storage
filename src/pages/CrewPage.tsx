import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useUserId } from "../auth";
import { AppHeader } from "../components/AppHeader";
import { Icon } from "../components/Icon";
import { Sheet } from "../components/Sheet";
import * as store from "../data/store";
import type { Boat } from "../data/types";
import { useBoatRole } from "../lib/useBoatRole";
import { useOnline } from "../lib/useOnline";

const ROLE_LABEL: Record<store.BoatRole, string> = { owner: "Owner", crew: "Crew", viewer: "View only" };
const ROLE_HELP = {
  crew: "Can add, change and delete decks, locations, containers, items and documents.",
  viewer: "Can look at everything and open documents, but can't change anything.",
};

/** Who's on a boat. The owner invites people, changes roles and removes them; others can leave. */
export function CrewPage() {
  const { boatId } = useParams();
  const userId = useUserId();
  const navigate = useNavigate();
  const role = useBoatRole(boatId);
  const isOwner = role === "owner";
  const online = useOnline();
  const [boat, setBoat] = useState<Boat | null | undefined>(undefined);
  const [crew, setCrew] = useState<store.CrewMember[]>([]);
  const [invites, setInvites] = useState<store.Invite[]>([]);
  const [inviting, setInviting] = useState(false);
  const [sharing, setSharing] = useState<store.Invite | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; body: string; action: string; run: () => Promise<void> } | null>(null);

  const load = useCallback(async () => {
    const b = await store.getBoat(boatId!);
    setBoat(b ?? null);
    if (!b) return;
    setCrew(await store.boatCrew(b.id));
  }, [boatId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (isOwner && boatId) store.pendingInvites(boatId).then(setInvites); }, [isOwner, boatId]);

  if (boat === null) return <Navigate to="/" replace />;
  if (!boat) return null;

  const reloadInvites = async () => setInvites(await store.pendingInvites(boat.id));

  return (
    <div className="page">
      <AppHeader backTo={`/boats/${boat.id}`} title="Crew" subtitle={boat.name}
        right={isOwner && (
          <button className="icon-btn primary" onClick={() => setInviting(true)} aria-label="Invite someone">
            <Icon name="plus" size={22} />
          </button>
        )}
      />

      <section className="list">
        <h2 className="section-title">On this boat</h2>
        <div className="card">
          {crew.map(m => (
            <div key={m.userId} className="crew-row">
              <span className="avatar">{m.email[0]?.toUpperCase()}</span>
              <span className="grow crew-who">
                <strong>{m.email}{m.userId === userId && " (you)"}</strong>
                <small>{ROLE_LABEL[m.role]}</small>
              </span>
              {isOwner && m.role !== "owner" && (
                <span className="crew-actions">
                  <select value={m.role} aria-label={`Role for ${m.email}`}
                    onChange={async e => { await store.setCrewRole(boat.id, m.userId, e.target.value as "crew" | "viewer"); await load(); }}>
                    <option value="crew">Crew</option>
                    <option value="viewer">View only</option>
                  </select>
                  <button className="icon-btn small" aria-label={`Remove ${m.email}`} onClick={() => setConfirm({
                    title: "Remove from boat?",
                    body: `${m.email} will no longer see or change ${boat.name}. Anything they added stays.`,
                    action: "Remove",
                    run: async () => { await store.removeCrew(boat.id, m.userId); await load(); },
                  })}>
                    <Icon name="x" size={16} />
                  </button>
                </span>
              )}
            </div>
          ))}
        </div>

        {isOwner && (
          <>
            <h2 className="section-title">Invites waiting</h2>
            {invites.length === 0 ? (
              <button className="btn block" onClick={() => setInviting(true)}><Icon name="users" size={18} /> Invite someone</button>
            ) : (
              <div className="card">
                {invites.map(inv => (
                  <div key={inv.id} className="crew-row">
                    <span className="avatar pending"><Icon name="mail" size={16} /></span>
                    <span className="grow crew-who">
                      <strong>{inv.email}</strong>
                      <small>{ROLE_LABEL[inv.role]} · not accepted yet</small>
                    </span>
                    <span className="crew-actions">
                      <button className="btn small" onClick={() => setSharing(inv)}><Icon name="share" size={15} /> Send</button>
                      <button className="icon-btn small" aria-label={`Cancel invite for ${inv.email}`} onClick={() => setConfirm({
                        title: "Cancel invite?",
                        body: `The link sent to ${inv.email} will stop working.`,
                        action: "Cancel invite",
                        run: async () => { await store.cancelInvite(inv.id); await reloadInvites(); },
                      })}>
                        <Icon name="x" size={16} />
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {online && role && role !== "owner" && (
          <button className="btn danger-text block" onClick={() => setConfirm({
            title: "Leave this boat?",
            body: `You'll no longer see ${boat.name}. The owner can invite you again.`,
            action: "Leave boat",
            run: async () => { await store.removeCrew(boat.id, userId); navigate("/", { replace: true }); },
          })}>
            Leave this boat
          </button>
        )}
      </section>

      {inviting && (
        <InviteForm boatName={boat.name} onClose={() => setInviting(false)}
          onCreate={async (email, r) => {
            const inv = await store.createInvite(boat.id, email, r);
            await reloadInvites();
            setInviting(false);
            setSharing(inv);
          }} />
      )}

      {sharing && <ShareInvite invite={sharing} boatName={boat.name} onClose={() => setSharing(null)} />}

      {confirm && (
        <Sheet title={confirm.title} onClose={() => setConfirm(null)}>
          <div className="confirm">
            <p>{confirm.body}</p>
            <div className="row">
              <button className="btn" onClick={() => setConfirm(null)}>Never mind</button>
              <button className="btn danger grow" onClick={async () => { await confirm.run(); setConfirm(null); }}>{confirm.action}</button>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function InviteForm({ boatName, onCreate, onClose }: {
  boatName: string;
  onCreate: (email: string, role: "crew" | "viewer") => Promise<void>;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"crew" | "viewer">("crew");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError("Please enter a valid email address.");
    setBusy(true);
    try {
      await onCreate(email, role);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the invite.");
      setBusy(false);
    }
  }

  return (
    <Sheet title={`Invite to ${boatName}`} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label className="field">
          <span>Their email address</span>
          <input type="email" autoFocus autoComplete="off" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="name@example.com" />
          <small className="field-hint">They'll need to sign in (or sign up) with this same email to accept.</small>
        </label>
        <div className="field">
          <span>What can they do?</span>
          {(["crew", "viewer"] as const).map(r => (
            <label key={r} className={`role-option${role === r ? " on" : ""}`}>
              <input type="radio" name="role" checked={role === r} onChange={() => setRole(r)} />
              <span><strong>{ROLE_LABEL[r]}</strong><small>{ROLE_HELP[r]}</small></span>
            </label>
          ))}
        </div>
        {error && <p className="error">{error}</p>}
        <button className="btn primary block" disabled={busy}>{busy ? "Creating…" : "Create invite"}</button>
      </form>
    </Sheet>
  );
}

/** Ways to get the invite link to the person: the phone's share menu, email, or copy. */
function ShareInvite({ invite, boatName, onClose }: { invite: store.Invite; boatName: string; onClose: () => void }) {
  const link = store.inviteLink(invite.token);
  const [copied, setCopied] = useState(false);
  const message = `You're invited to help with "${boatName}" on Boat Storage Manager. Open this link and sign in (or sign up) with ${invite.email}:`;
  const mailto = `mailto:${encodeURIComponent(invite.email)}?subject=${encodeURIComponent(`Join ${boatName} on Boat Storage Manager`)}&body=${encodeURIComponent(`${message}\n\n${link}`)}`;
  const canShare = typeof navigator.share === "function";

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      window.prompt("Copy this link:", link);
    }
  }

  return (
    <Sheet title="Send the invite" onClose={onClose}>
      <div className="form">
        <p>Send this link to <strong>{invite.email}</strong>. It works for 30 days, only for that email address.</p>
        <div className="invite-link">{link}</div>
        {canShare && (
          <button className="btn primary block" onClick={() => navigator.share({ title: `Join ${boatName}`, text: message, url: link }).catch(() => {})}>
            <Icon name="share" size={17} /> Share…
          </button>
        )}
        <a className={`btn block${canShare ? "" : " primary"}`} href={mailto}><Icon name="mail" size={17} /> Email it</a>
        <button className="btn block" onClick={copy}>{copied ? "Copied ✓" : "Copy link"}</button>
      </div>
    </Sheet>
  );
}

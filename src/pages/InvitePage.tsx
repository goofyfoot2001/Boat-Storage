import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth";
import { Icon } from "../components/Icon";
import * as store from "../data/store";
import { Login } from "./Login";

/** Remembered while someone signs up and confirms their email, so the invite can pick up where it left off. */
export const PENDING_INVITE_KEY = "bsm-pending-invite";

const ROLE_TEXT = { owner: "owner", crew: "crew (can add and change things)", viewer: "view only" };

/** Where an invite link lands. Works whether or not you're signed in. */
export function InvitePage() {
  const { token = "" } = useParams();
  const { session, signOut } = useAuth();
  const navigate = useNavigate();
  const [info, setInfo] = useState<store.InviteInfo | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    store.inviteInfo(token).then(i => setInfo(i ?? null), () => setInfo(null));
  }, [token]);

  // Keep the invite in mind until it's accepted (e.g. across the email-confirmation step).
  useEffect(() => {
    try { if (info?.status === "pending") localStorage.setItem(PENDING_INVITE_KEY, token); } catch { /* storage blocked */ }
  }, [info, token]);

  async function accept() {
    setBusy(true);
    setError("");
    try {
      const boatId = await store.acceptInvite(token);
      try { localStorage.removeItem(PENDING_INVITE_KEY); } catch { /* ignore */ }
      navigate(`/boats/${boatId}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't accept the invite.");
      setBusy(false);
    }
  }

  function notNow() {
    try { localStorage.removeItem(PENDING_INVITE_KEY); } catch { /* ignore */ }
    navigate("/", { replace: true });
  }

  if (info === undefined) return <main className="login"><p className="muted">Loading invite…</p></main>;

  if (info === null || info.status !== "pending") {
    const message = info?.status === "accepted" ? "This invite has already been accepted."
      : info?.status === "expired" ? "This invite has expired. Ask the boat's owner to send a new one."
      : "This invite link isn't valid. Check you copied the whole link.";
    return (
      <main className="login">
        <img className="login-logo" src={`${import.meta.env.BASE_URL}logo.png`} alt="" />
        <div className="card form" style={{ marginTop: 28, width: "100%" }}>
          <h2>Invite</h2>
          <p>{message}</p>
          <button className="btn primary block" onClick={notNow}>Go to my boats</button>
        </div>
      </main>
    );
  }

  const intro = (
    <div className="invite-intro">
      <Icon name="anchor" size={28} />
      <p>
        {info.invitedBy ? <><strong>{info.invitedBy}</strong> invited you</> : "You're invited"} to join{" "}
        <strong>{info.boatName}</strong> as <strong>{ROLE_TEXT[info.role]}</strong>.
      </p>
    </div>
  );

  // Not signed in: sign in or create an account with the invited email, then come back here.
  if (!session) {
    return (
      <Login initialEmail={info.email} lockEmail
        notice={<>{intro}<p className="muted">Sign in, or create a free account, with <strong>{info.email}</strong> to accept.</p></>} />
    );
  }

  const rightPerson = session.email.toLowerCase() === info.email.toLowerCase();

  return (
    <main className="login">
      <img className="login-logo" src={`${import.meta.env.BASE_URL}logo.png`} alt="" />
      <div className="card form" style={{ marginTop: 28, width: "100%" }}>
        {intro}
        {rightPerson ? (
          <>
            {error && <p className="error">{error}</p>}
            <button className="btn primary block" disabled={busy} onClick={accept}>{busy ? "Joining…" : `Join ${info.boatName}`}</button>
            <button className="btn link block" onClick={notNow}>Not now</button>
          </>
        ) : (
          <>
            <p className="error">
              This invite was sent to <strong>{info.email}</strong>, but you're signed in as <strong>{session.email}</strong>.
            </p>
            <button className="btn primary block" onClick={signOut}>Sign out and use {info.email}</button>
            <button className="btn link block" onClick={notNow}>Go to my boats</button>
          </>
        )}
      </div>
    </main>
  );
}

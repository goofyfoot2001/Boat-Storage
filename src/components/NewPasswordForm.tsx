import { useState, type FormEvent } from "react";
import * as store from "../data/store";

/** Choose a new password (after a reset email, or to change it while signed in). */
export function NewPasswordForm({ onDone, onCancel }: { onDone: () => void; onCancel?: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords don't match.");
    setBusy(true);
    try {
      await store.setNewPassword(password);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the new password.");
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <label className="field">
        <span>New password</span>
        <input type="password" autoComplete="new-password" required autoFocus value={password} onChange={e => setPassword(e.target.value)} />
      </label>
      <label className="field">
        <span>Confirm new password</span>
        <input type="password" autoComplete="new-password" required value={confirm} onChange={e => setConfirm(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="btn primary block" disabled={busy}>{busy ? "Saving…" : "Save new password"}</button>
      {onCancel && <button type="button" className="btn link block" onClick={onCancel}>Cancel</button>}
    </form>
  );
}

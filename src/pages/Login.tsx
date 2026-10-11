import { useState, type FormEvent, type ReactNode } from "react";
import { useAuth } from "../auth";

/**
 * Sign in / create account. From an invite link the email is filled in (and locked, since the
 * invite only works for that address) and `notice` explains what they're joining.
 */
export function Login({ initialEmail = "", lockEmail = false, notice }: { initialEmail?: string; lockEmail?: boolean; notice?: ReactNode } = {}) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (mode === "up") {
      if (password.length < 8) return setError("Password must be at least 8 characters.");
      if (password !== confirm) return setError("Passwords don't match.");
    }
    setBusy(true);
    try {
      if (mode === "in") await signIn(email, password);
      else if ((await signUp(email, password)).needsConfirmation) {
        setSentTo(email.trim());
        setBusy(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <main className="login">
        <img className="login-logo" src={`${import.meta.env.BASE_URL}logo.png`} alt="" />
        <div className="card form" style={{ marginTop: 28 }}>
          <h2>Check your email</h2>
          <p>We sent a confirmation link to <strong>{sentTo}</strong>. Tap it to finish creating your account, then sign in.</p>
          <button className="btn primary block" onClick={() => { setSentTo(""); setMode("in"); setPassword(""); setConfirm(""); }}>
            Back to sign in
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="login">
      <img className="login-logo" src={`${import.meta.env.BASE_URL}logo.png`} alt="" />
      <h1>Boat Storage Manager</h1>
      <p className="tagline">Where the float is my stuff!</p>

      <form className="form card" onSubmit={submit}>
        {notice}
        <h2>{mode === "in" ? "Sign in" : "Create your account"}</h2>
        <label className="field">
          <span>Email</span>
          <input type="email" autoComplete="email" required value={email} readOnly={lockEmail}
            onChange={e => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" required autoComplete={mode === "in" ? "current-password" : "new-password"}
            value={password} onChange={e => setPassword(e.target.value)} />
        </label>
        {mode === "up" && (
          <label className="field">
            <span>Confirm password</span>
            <input type="password" required autoComplete="new-password" value={confirm}
              onChange={e => setConfirm(e.target.value)} />
          </label>
        )}
        {error && <p className="error">{error}</p>}
        <button className="btn primary block" disabled={busy}>
          {busy ? "Please wait…" : mode === "in" ? "Sign in" : "Create account"}
        </button>
        <button type="button" className="btn link block" onClick={() => { setMode(mode === "in" ? "up" : "in"); setError(""); }}>
          {mode === "in" ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>
      </form>
    </main>
  );
}

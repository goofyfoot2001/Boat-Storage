import { useState, type FormEvent, type ReactNode } from "react";
import { useAuth } from "../auth";
import * as store from "../data/store";

type Mode = "in" | "up" | "forgot";

/**
 * Sign in / create account / forgot password. From an invite link the email is filled in (and
 * locked, since the invite only works for that address) and `notice` explains what they're joining.
 */
export function Login({ initialEmail = "", lockEmail = false, notice }: { initialEmail?: string; lockEmail?: boolean; notice?: ReactNode } = {}) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>("in");
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ to: string; why: "confirm" | "reset" } | null>(null);

  const switchTo = (m: Mode) => { setMode(m); setError(""); setPassword(""); setConfirm(""); };

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
      else if (mode === "forgot") {
        await store.requestPasswordReset(email);
        setSent({ to: email.trim(), why: "reset" });
        setBusy(false);
      } else if ((await signUp(email, password)).needsConfirmation) {
        setSent({ to: email.trim(), why: "confirm" });
        setBusy(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <main className="login">
        <img className="login-logo" src={`${import.meta.env.BASE_URL}logo.png`} alt="" />
        <div className="card form" style={{ marginTop: 28 }}>
          <h2>Check your email</h2>
          {sent.why === "confirm" ? (
            <p>We sent a confirmation link to <strong>{sent.to}</strong>. Tap it to finish creating your account, then sign in.</p>
          ) : (
            <p>
              If there's an account for <strong>{sent.to}</strong>, we've sent it a link to choose a new password.
              Open the email on this phone (or any device) and tap the link. Check your spam folder if it doesn't arrive in a few minutes.
            </p>
          )}
          <button className="btn primary block" onClick={() => { setSent(null); switchTo("in"); }}>Back to sign in</button>
        </div>
      </main>
    );
  }

  const title = mode === "in" ? "Sign in" : mode === "up" ? "Create your account" : "Reset your password";

  return (
    <main className="login">
      <img className="login-logo" src={`${import.meta.env.BASE_URL}logo.png`} alt="" />
      <h1>Boat Storage Manager</h1>
      <p className="tagline">Where the float is my stuff!</p>

      <form className="form card" onSubmit={submit}>
        {notice}
        <h2>{title}</h2>
        {mode === "forgot" && <p className="muted">Enter your email and we'll send you a link to choose a new password.</p>}
        <label className="field">
          <span>Email</span>
          <input type="email" autoComplete="email" required value={email} readOnly={lockEmail}
            onChange={e => setEmail(e.target.value)} />
        </label>
        {mode !== "forgot" && (
          <label className="field">
            <span>Password</span>
            <input type="password" required autoComplete={mode === "in" ? "current-password" : "new-password"}
              value={password} onChange={e => setPassword(e.target.value)} />
          </label>
        )}
        {mode === "in" && (
          <button type="button" className="btn link forgot" onClick={() => switchTo("forgot")}>Forgot password?</button>
        )}
        {mode === "up" && (
          <label className="field">
            <span>Confirm password</span>
            <input type="password" required autoComplete="new-password" value={confirm}
              onChange={e => setConfirm(e.target.value)} />
          </label>
        )}
        {error && <p className="error">{error}</p>}
        <button className="btn primary block" disabled={busy}>
          {busy ? "Please wait…" : mode === "in" ? "Sign in" : mode === "up" ? "Create account" : "Send reset link"}
        </button>
        {mode === "forgot" ? (
          <button type="button" className="btn link block" onClick={() => switchTo("in")}>Back to sign in</button>
        ) : (
          <button type="button" className="btn link block" onClick={() => switchTo(mode === "in" ? "up" : "in")}>
            {mode === "in" ? "New here? Create an account" : "Already have an account? Sign in"}
          </button>
        )}
      </form>
    </main>
  );
}

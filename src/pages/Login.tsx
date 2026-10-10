import { useState, type FormEvent } from "react";
import { useAuth } from "../auth";

export function Login() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (mode === "up") {
      if (password.length < 8) return setError("Password must be at least 8 characters.");
      if (password !== confirm) return setError("Passwords don't match.");
    }
    setBusy(true);
    try {
      await (mode === "in" ? signIn(email, password) : signUp(email, password));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <img className="login-logo" src="/logo.png" alt="" />
      <h1>Boat Storage Manager</h1>
      <p className="tagline">Where the float is my stuff!</p>

      <form className="form card" onSubmit={submit}>
        <h2>{mode === "in" ? "Sign in" : "Create your account"}</h2>
        <label className="field">
          <span>Email</span>
          <input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
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

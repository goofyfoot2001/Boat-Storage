import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import * as store from "./data/store";
import { openedFromPasswordReset, supabase } from "./data/supabase";

interface AuthValue {
  session: store.Session | null;
  signIn: typeof store.signIn;
  signUp: typeof store.signUp;
  signOut: () => void;
  /** Arrived from a password-reset email: ask for a new password before anything else. */
  choosingNewPassword: boolean;
  doneChoosingPassword: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // undefined = still checking whether someone is already signed in
  const [session, setSession] = useState<store.Session | null | undefined>(undefined);
  const [choosingNewPassword, setChoosingNewPassword] = useState(openedFromPasswordReset);

  useEffect(() => {
    // Offshore the sign-in can't be renewed, so carry on as the person last signed in on this
    // device rather than locking them out of their saved boats.
    if (!navigator.onLine) {
      const saved = savedSignIn();
      if (saved) setSession(saved);
    }
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") setChoosingNewPassword(true);
      if (s) setSession({ userId: s.user.id, email: s.user.email ?? "" });
      else setSession(!navigator.onLine ? savedSignIn() : null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) return null;

  const value: AuthValue = {
    session,
    signIn: store.signIn,
    signUp: store.signUp,
    signOut: () => {
      store.signOut();
      forgetSavedSignIn();
      setSession(null);
      setChoosingNewPassword(false);
    },
    choosingNewPassword,
    doneChoosingPassword: () => setChoosingNewPassword(false),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Supabase keeps the sign-in in a "sb-<project>-auth-token" entry on the device. */
function signInKey() {
  try { return Object.keys(localStorage).find(k => k.startsWith("sb-") && k.endsWith("-auth-token")); } catch { return undefined; }
}

function savedSignIn(): store.Session | null {
  try {
    const key = signInKey();
    const user = key && JSON.parse(localStorage.getItem(key) ?? "null")?.user;
    return user?.id ? { userId: user.id, email: user.email ?? "" } : null;
  } catch {
    return null;
  }
}

function forgetSavedSignIn() {
  try { const key = signInKey(); if (key) localStorage.removeItem(key); } catch { /* ignore */ }
}

export function useAuth() {
  const v = useContext(AuthContext);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}

/** For pages behind the login: the signed-in user's id. */
export function useUserId() {
  return useAuth().session!.userId;
}

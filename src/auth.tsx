import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import * as store from "./data/store";
import { supabase } from "./data/supabase";

interface AuthValue {
  session: store.Session | null;
  signIn: typeof store.signIn;
  signUp: typeof store.signUp;
  signOut: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // undefined = still checking whether someone is already signed in
  const [session, setSession] = useState<store.Session | null | undefined>(undefined);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s ? { userId: s.user.id, email: s.user.email ?? "" } : null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) return null;

  const value: AuthValue = {
    session,
    signIn: store.signIn,
    signUp: store.signUp,
    signOut: () => { store.signOut(); },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
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

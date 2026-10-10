import { createContext, useContext, useState, type ReactNode } from "react";
import * as store from "./data/store";

interface AuthValue {
  session: store.Session | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState(store.currentSession);
  const value: AuthValue = {
    session,
    signIn: async (e, p) => setSession(await store.signIn(e, p)),
    signUp: async (e, p) => setSession(await store.signUp(e, p)),
    signOut: () => { store.signOut(); setSession(null); },
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

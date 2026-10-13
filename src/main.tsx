import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import { OfflineBanner } from "./components/OfflineBanner";
import { refreshOfflineBoats } from "./data/store";
import { BoatDecks } from "./pages/BoatDecks";
import { Boats } from "./pages/Boats";
import { CrewPage } from "./pages/CrewPage";
import { DeckPlan } from "./pages/DeckPlan";
import { InvitePage, PENDING_INVITE_KEY } from "./pages/InvitePage";
import { LocationPage } from "./pages/LocationPage";
import { SearchPage } from "./pages/SearchPage";
import { Login } from "./pages/Login";
import { startAutoUpdate } from "./lib/autoUpdate";
import "./styles.css";

startAutoUpdate();

/** An invite opened before signing up (and confirming email) — pick it back up once signed in. */
function pendingInvite() {
  try { return localStorage.getItem(PENDING_INVITE_KEY); } catch { return null; }
}

function App() {
  const { session } = useAuth();
  const { pathname } = useLocation();

  // Invite links work signed in or out.
  if (pathname.startsWith("/invite/")) {
    return <Routes><Route path="/invite/:token" element={<InvitePage />} /></Routes>;
  }
  if (!session) return <Login />;

  const resume = pendingInvite();
  if (resume) return <Navigate to={`/invite/${resume}`} replace />;

  return (
    <>
    <OfflineBanner />
    <KeepOfflineCopiesFresh userId={session.userId} />
    <Routes>
      <Route path="/" element={<Boats />} />
      <Route path="/boats/:boatId" element={<BoatDecks />} />
      <Route path="/boats/:boatId/search" element={<SearchPage />} />
      <Route path="/boats/:boatId/crew" element={<CrewPage />} />
      <Route path="/decks/:deckId" element={<DeckPlan />} />
      <Route path="/locations/:locationId" element={<LocationPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}

/** Refresh the boats kept on this device when the app opens, comes back to the front, or reconnects. */
function KeepOfflineCopiesFresh({ userId }: { userId: string }) {
  useEffect(() => {
    const refresh = () => refreshOfflineBoats(userId);
    const refreshIfShown = () => { if (document.visibilityState === "visible") refresh(); };
    refresh();
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refreshIfShown);
    return () => {
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refreshIfShown);
    };
  }, [userId]);
  return null;
}

// Lets the app itself open with no signal (it's kept on the device after the first visit).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => {});
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);

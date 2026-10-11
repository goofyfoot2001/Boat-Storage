import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
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
    <Routes>
      <Route path="/" element={<Boats />} />
      <Route path="/boats/:boatId" element={<BoatDecks />} />
      <Route path="/boats/:boatId/search" element={<SearchPage />} />
      <Route path="/boats/:boatId/crew" element={<CrewPage />} />
      <Route path="/decks/:deckId" element={<DeckPlan />} />
      <Route path="/locations/:locationId" element={<LocationPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
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

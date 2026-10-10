import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import { BoatDecks } from "./pages/BoatDecks";
import { Boats } from "./pages/Boats";
import { DeckPlan } from "./pages/DeckPlan";
import { LocationPage } from "./pages/LocationPage";
import { Login } from "./pages/Login";
import "./styles.css";

function App() {
  const { session } = useAuth();
  if (!session) return <Login />;
  return (
    <Routes>
      <Route path="/" element={<Boats />} />
      <Route path="/boats/:boatId" element={<BoatDecks />} />
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

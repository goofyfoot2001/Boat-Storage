import { useCallback, useEffect, useState } from "react";
import { useUserId } from "../auth";
import * as store from "../data/store";
import { mayLoseSavedData } from "../lib/device";
import { formatBytes, plural } from "../lib/format";
import { useOnline } from "../lib/useOnline";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";

const when = (t: number) => new Date(t).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });

/** "Keep on this phone" for a boat: what's saved, when, how big — and the settings to change it. */
export function OfflineCard({ boatId, boatName }: { boatId: string; boatName: string }) {
  const userId = useUserId();
  const online = useOnline();
  const [status, setStatus] = useState<store.OfflineStatus | undefined>();
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => setStatus(await store.offlineStatus(boatId)), [boatId]);
  useEffect(() => { load(); }, [load]);

  return (
    <>
      <button className="card crew-link offline-link" onClick={() => setOpen(true)}>
        <span className={`thumb deck-thumb${status ? " saved" : ""}`}><Icon name={status ? "check" : "download"} size={20} /></span>
        <span className="card-text">
          <h3>Offline</h3>
          <p>{status ? `On this phone · updated ${when(status.savedAt)} · ${formatBytes(status.bytes)}` : "Not saved on this phone"}</p>
        </span>
        <Icon name="chevron-right" size={18} color="var(--muted)" />
      </button>
      {open && (
        <OfflineSheet boatId={boatId} boatName={boatName} userId={userId} online={online} status={status}
          onChanged={load} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function OfflineSheet({ boatId, boatName, userId, online, status, onChanged, onClose }: {
  boatId: string;
  boatName: string;
  userId: string;
  online: boolean;
  status: store.OfflineStatus | undefined;
  onChanged: () => Promise<void>;
  onClose: () => void;
}) {
  const [photos, setPhotos] = useState(status?.options.photos ?? true);
  const [docs, setDocs] = useState(status?.options.docs ?? true);
  const [estimate, setEstimate] = useState<Awaited<ReturnType<typeof store.offlineEstimate>>>();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => { if (online) store.offlineEstimate(boatId).then(setEstimate, () => {}); }, [boatId, online]);

  async function save() {
    setError("");
    setProgress({ done: 0, total: 0 });
    try {
      await store.saveBoatOffline(boatId, userId, { photos, docs }, (done, total) => setProgress({ done, total }));
      await onChanged();
    } catch {
      setError("The download stopped — check your connection and try again. Anything already saved is kept.");
    }
    setProgress(null);
  }

  async function remove() {
    await store.removeBoatOffline(boatId);
    await onChanged();
    onClose();
  }

  const busy = progress !== null;

  return (
    <Sheet title="Use offline" onClose={busy ? () => {} : onClose}>
      <div className="form">
        <p>
          Keep a copy of <strong>{boatName}</strong> on this phone so you can look things up with no signal —
          offshore, below decks, anywhere. It refreshes by itself whenever you're back online.
          With no signal you can look but not change things.
        </p>

        {status && (
          <p className="hint"><Icon name="check" size={14} /> Saved {when(status.savedAt)} · {plural(status.files, "file")} · {formatBytes(status.bytes)}</p>
        )}

        <div className="field">
          <span>What to keep on this phone</span>
          <label className="role-option on">
            <input type="checkbox" checked disabled />
            <span><strong>Decks, pins, containers and items</strong><small>Always, along with the deck layout pictures. Small.</small></span>
          </label>
          <label className={`role-option${photos ? " on" : ""}`}>
            <input type="checkbox" checked={photos} onChange={e => setPhotos(e.target.checked)} disabled={busy} />
            <span><strong>Photos</strong><small>{estimate ? `${plural(estimate.photos, "photo")} of boats, spots, bins and items` : "Pictures of boats, spots, bins and items"}</small></span>
          </label>
          <label className={`role-option${docs ? " on" : ""}`}>
            <input type="checkbox" checked={docs} onChange={e => setDocs(e.target.checked)} disabled={busy} />
            <span><strong>Documents</strong><small>{estimate ? `${plural(estimate.docs, "document")} · ${formatBytes(estimate.docBytes)}` : "Manuals, receipts, spreadsheets"}</small></span>
          </label>
        </div>

        {mayLoseSavedData && (
          <p className="hint">
            <Icon name="alert-triangle" size={14} />
            On iPhone, add this site to your Home Screen (Share → Add to Home Screen) and open it from there —
            otherwise Safari may clear the saved copy if you don't use it for a while.
          </p>
        )}

        {progress && (
          <div className="progress" aria-live="polite">
            <div className="progress-bar"><span style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 5}%` }} /></div>
            <small>{progress.total ? `Downloading ${progress.done} of ${plural(progress.total, "file")}…` : "Getting ready…"}</small>
          </div>
        )}
        {error && <p className="error">{error}</p>}

        {online ? (
          <button className="btn primary block" disabled={busy} onClick={save}>
            <Icon name="download" size={17} /> {busy ? "Saving…" : status ? "Update now" : "Save to this phone"}
          </button>
        ) : (
          <p className="muted">You're offline. Connect to save or update this boat.</p>
        )}
        {status && !busy && (
          <button className="btn danger-text block" onClick={remove}>Remove from this phone</button>
        )}
      </div>
    </Sheet>
  );
}

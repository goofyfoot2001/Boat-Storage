import { useState, type FormEvent } from "react";
import type { ContainerFields } from "../data/store";
import type { Container } from "../data/types";
import { PIN_COLORS } from "../lib/format";
import { targetValue, type Target } from "../lib/places";
import { Icon } from "./Icon";
import { PhotoField } from "./PhotoField";
import { PlaceSelect } from "./PlaceSelect";
import { Sheet } from "./Sheet";

/** Add/edit a container (bin, tote, box). */
export function ContainerForm({ container, insideName, targets = [], onSubmit, onClose, onDelete }: {
  container?: Container;
  /** Where a new container is being added, e.g. "Port locker" or "Red tote". */
  insideName?: string;
  /** Places this container can be moved to (editing only). */
  targets?: Target[];
  onSubmit: (f: ContainerFields, photo: Blob | null | undefined, moveTo?: Target) => Promise<void>;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(container?.name ?? "");
  const [color, setColor] = useState(container?.color ?? PIN_COLORS[0]);
  const [notes, setNotes] = useState(container?.notes ?? "");
  const [photo, setPhoto] = useState<Blob | null | undefined>(undefined);
  const startPlace = container ? targetValue(container.locationId, container.parentId) : "";
  const [place, setPlace] = useState(startPlace);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Please give this container a name.");
    setBusy(true);
    try {
      const moveTo = place !== startPlace ? targets.find(t => t.value === place) : undefined;
      await onSubmit({ name, notes, color }, photo, moveTo);
      onClose();
    } catch (err) {
      setError(err instanceof Error && err.message.includes("inside itself") ? err.message : "Something went wrong saving. Please try again.");
      setBusy(false);
    }
  }

  return (
    <Sheet title={container ? "Edit container" : "Add container"} onClose={onClose}>
      <form onSubmit={submit} className="form">
        {insideName && <p className="hint"><Icon name="box" size={14} /> Goes in {insideName}</p>}
        <label className="field">
          <span>Container name</span>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Red tote, Tackle box"
            autoFocus={!container} maxLength={60} />
        </label>

        <div className="field">
          <span>Color tag</span>
          <div className="swatches" role="radiogroup" aria-label="Color tag">
            {PIN_COLORS.map(c => (
              <button key={c} type="button" role="radio" aria-checked={c === color} aria-label={c}
                className={`swatch${c === color ? " on" : ""}`} style={{ background: c }} onClick={() => setColor(c)} />
            ))}
          </div>
        </div>

        <label className="field">
          <span>Description <em>(optional)</em></span>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} maxLength={4000}
            placeholder="e.g. Clear tote with blue lid" />
        </label>

        {container && targets.length > 1 && (
          <PlaceSelect label="Stored in" targets={targets} value={place} onChange={setPlace}
            hint={place !== startPlace ? "Saving will move this container and everything in it." : undefined} />
        )}

        <PhotoField label="Picture" hint="A photo helps you recognize the bin" savedPath={container?.photoPath}
          value={photo} onChange={v => { setPhoto(v); setError(""); }} onError={setError} />

        {error && <p className="error">{error}</p>}

        <button className="btn primary block" disabled={busy}>{busy ? "Saving…" : container ? "Save changes" : "Add container"}</button>
        {onDelete && (
          <button type="button" className="btn danger-text block" onClick={onDelete}><Icon name="trash" size={16} /> Delete container</button>
        )}
      </form>
    </Sheet>
  );
}

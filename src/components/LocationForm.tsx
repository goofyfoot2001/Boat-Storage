import { useState, type FormEvent } from "react";
import type { LocationFields } from "../data/store";
import { PIN_COLORS } from "../lib/format";
import { Icon } from "./Icon";
import { PhotoField } from "./PhotoField";
import { Sheet } from "./Sheet";

export function LocationForm({ title, initial, initialPhotoPath, submitLabel, onSubmit, onClose, onMove, onDelete }: {
  title: string;
  initial?: LocationFields;
  initialPhotoPath?: string | null;
  submitLabel: string;
  onSubmit: (f: LocationFields, photo: Blob | null | undefined) => Promise<void>;
  onClose: () => void;
  onMove?: () => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState(initial?.color ?? PIN_COLORS[0]);
  const [photo, setPhoto] = useState<Blob | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Please give this storage location a name.");
    setBusy(true);
    try {
      await onSubmit({ name, color }, photo);
      onClose();
    } catch {
      setError("Something went wrong saving. Please try again.");
      setBusy(false);
    }
  }

  return (
    <Sheet title={title} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <label className="field">
          <span>Location name</span>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Port locker, Under V-berth"
            autoFocus maxLength={60} enterKeyHint="done" />
        </label>

        <div className="field">
          <span>Dot color</span>
          <div className="swatches" role="radiogroup" aria-label="Dot color">
            {PIN_COLORS.map(c => (
              <button key={c} type="button" role="radio" aria-checked={c === color} aria-label={c}
                className={`swatch${c === color ? " on" : ""}`} style={{ background: c }} onClick={() => setColor(c)} />
            ))}
          </div>
        </div>

        <PhotoField label="Photo of this spot" hint="e.g. the inside of the locker" savedPath={initialPhotoPath}
          value={photo} onChange={v => { setPhoto(v); setError(""); }} onError={setError} />

        {error && <p className="error">{error}</p>}

        <button className="btn primary block" disabled={busy}>{busy ? "Saving…" : submitLabel}</button>
        {onMove && (
          <button type="button" className="btn block" onClick={onMove}><Icon name="map-pin" size={16} /> Move dot on layout</button>
        )}
        {onDelete && (
          <button type="button" className="btn danger-text block" onClick={onDelete}><Icon name="trash" size={16} /> Delete location</button>
        )}
      </form>
    </Sheet>
  );
}

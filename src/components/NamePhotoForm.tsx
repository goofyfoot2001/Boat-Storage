import { useState, type FormEvent } from "react";
import { Icon } from "./Icon";
import { PhotoField } from "./PhotoField";
import { Sheet } from "./Sheet";

interface Props {
  title: string;
  nameLabel: string;
  namePlaceholder: string;
  photoLabel: string;
  photoHint: string;
  initialName?: string;
  initialPhotoPath?: string | null;
  submitLabel: string;
  onSubmit: (name: string, photo: Blob | null | undefined) => Promise<void>;
  onClose: () => void;
  onDelete?: () => void;
}

/** Add/edit form for a boat or deck: a name and an optional picture. */
export function NamePhotoForm(p: Props) {
  const [name, setName] = useState(p.initialName ?? "");
  const [photo, setPhoto] = useState<Blob | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError(`Please enter a ${p.nameLabel.toLowerCase()}.`);
    setBusy(true);
    try {
      await p.onSubmit(name, photo);
      p.onClose();
    } catch {
      setError("Something went wrong saving. Please try again.");
      setBusy(false);
    }
  }

  return (
    <Sheet title={p.title} onClose={p.onClose}>
      <form onSubmit={submit} className="form">
        <label className="field">
          <span>{p.nameLabel}</span>
          <input value={name} onChange={e => setName(e.target.value)} placeholder={p.namePlaceholder}
            autoFocus maxLength={60} enterKeyHint="done" />
        </label>

        <PhotoField label={p.photoLabel} hint={p.photoHint} savedPath={p.initialPhotoPath}
          value={photo} onChange={v => { setPhoto(v); setError(""); }} onError={setError} />

        {error && <p className="error">{error}</p>}

        <button className="btn primary block" disabled={busy}>{busy ? "Saving…" : p.submitLabel}</button>
        {p.onDelete && (
          <button type="button" className="btn danger-text block" onClick={p.onDelete}>
            <Icon name="trash" size={16} /> Delete
          </button>
        )}
      </form>
    </Sheet>
  );
}

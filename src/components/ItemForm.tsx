import { useRef, useState, type FormEvent } from "react";
import { shrinkImage } from "../lib/image";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";
import { usePhotoUrl } from "./usePhotoUrl";

interface Props {
  title: string;
  nameLabel: string;
  namePlaceholder: string;
  photoLabel: string;
  photoHint: string;
  initialName?: string;
  initialPhotoId?: string | null;
  submitLabel: string;
  onSubmit: (name: string, photo: Blob | null | undefined) => Promise<void>;
  onClose: () => void;
  onDelete?: () => void;
}

/** Add/edit form for a boat or deck: a name and an optional picture. */
export function ItemForm(p: Props) {
  const [name, setName] = useState(p.initialName ?? "");
  // undefined = unchanged, null = removed, Blob = newly picked
  const [photo, setPhoto] = useState<Blob | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const preview = usePhotoUrl(photo === undefined ? p.initialPhotoId : photo);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError("");
    try {
      setPhoto(await shrinkImage(file));
    } catch {
      setError("That file couldn't be opened as a picture.");
    }
  }

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

        <div className="field">
          <span>{p.photoLabel} <em>(optional)</em></span>
          {preview ? (
            <div className="photo-preview">
              <img src={preview} alt="" />
              <div className="photo-preview-actions">
                <button type="button" className="btn small" onClick={() => fileRef.current?.click()}>Change</button>
                <button type="button" className="btn small danger-outline" onClick={() => setPhoto(null)}>Remove</button>
              </div>
            </div>
          ) : (
            <button type="button" className="photo-drop" onClick={() => fileRef.current?.click()}>
              <Icon name="camera" size={26} />
              <strong>Add a picture</strong>
              <small>{p.photoHint}</small>
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" hidden
            onChange={e => { pick(e.target.files?.[0]); e.target.value = ""; }} />
        </div>

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

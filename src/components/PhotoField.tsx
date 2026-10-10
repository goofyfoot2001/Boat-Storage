import { useRef } from "react";
import { shrinkImage } from "../lib/image";
import { Icon } from "./Icon";
import { usePhotoUrl } from "./usePhotoUrl";

/**
 * Optional picture picker. `value`: undefined = keep the saved one (`savedPath`),
 * null = removed, Blob = newly picked.
 */
export function PhotoField({ label, hint, savedPath, value, onChange, onError }: {
  label: string;
  hint: string;
  savedPath?: string | null;
  value: Blob | null | undefined;
  onChange: (v: Blob | null) => void;
  onError: (message: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const preview = usePhotoUrl(value === undefined ? savedPath : value);

  async function pick(file: File | undefined) {
    if (!file) return;
    try {
      onChange(await shrinkImage(file));
    } catch {
      onError("That file couldn't be opened as a picture.");
    }
  }

  return (
    <div className="field">
      <span>{label} <em>(optional)</em></span>
      {preview ? (
        <div className="photo-preview">
          <img src={preview} alt="" />
          <div className="photo-preview-actions">
            <button type="button" className="btn small" onClick={() => fileRef.current?.click()}>Change</button>
            <button type="button" className="btn small danger-outline" onClick={() => onChange(null)}>Remove</button>
          </div>
        </div>
      ) : (
        <button type="button" className="photo-drop" onClick={() => fileRef.current?.click()}>
          <Icon name="camera" size={26} />
          <strong>Add a picture</strong>
          <small>{hint}</small>
        </button>
      )}
      <input ref={fileRef} type="file" accept="image/*" hidden
        onChange={e => { pick(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
  );
}

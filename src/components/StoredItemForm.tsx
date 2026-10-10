import { useState, type FormEvent } from "react";
import type { ItemFields } from "../data/store";
import type { Item } from "../data/types";
import { Icon } from "./Icon";
import { PhotoField } from "./PhotoField";
import { Sheet } from "./Sheet";

/** Add/edit something stored at a location. */
export function StoredItemForm({ item, onSubmit, onClose, onDelete }: {
  item?: Item;
  onSubmit: (f: ItemFields, photo: Blob | null | undefined) => Promise<void>;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [quantity, setQuantity] = useState(String(item?.quantity ?? 1));
  const [price, setPrice] = useState(item?.price != null ? item.price.toFixed(2) : "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [photo, setPhoto] = useState<Blob | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const qty = Math.max(0, Math.floor(Number(quantity) || 0));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Please enter what this is.");
    const cleanPrice = price.replace(/[$,\s]/g, "");
    if (cleanPrice && !/^\d+(\.\d{1,2})?$/.test(cleanPrice)) return setError("Price should look like 24.99");
    setBusy(true);
    try {
      await onSubmit({ name, quantity: qty, price: cleanPrice ? Number(cleanPrice) : null, notes }, photo);
      onClose();
    } catch {
      setError("Something went wrong saving. Please try again.");
      setBusy(false);
    }
  }

  return (
    <Sheet title={item ? "Edit item" : "Add item"} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <label className="field">
          <span>What is it?</span>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Spare impeller"
            autoFocus={!item} maxLength={100} />
        </label>

        <div className="row">
          <div className="field grow">
            <span>Quantity</span>
            <div className="stepper">
              <button type="button" onClick={() => setQuantity(String(Math.max(0, qty - 1)))} aria-label="One less">−</button>
              <input inputMode="numeric" value={quantity} onChange={e => setQuantity(e.target.value.replace(/\D/g, ""))}
                aria-label="Quantity" />
              <button type="button" onClick={() => setQuantity(String(qty + 1))} aria-label="One more">+</button>
            </div>
          </div>
          <label className="field grow">
            <span>Price each <em>(optional)</em></span>
            <div className="money">
              <span>$</span>
              <input inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" />
            </div>
          </label>
        </div>

        <label className="field">
          <span>Description <em>(optional)</em></span>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4} maxLength={4000}
            placeholder="Part numbers, where you bought it, a link to reorder…" />
          <small className="field-hint">Web links you paste here become tappable.</small>
        </label>

        <PhotoField label="Picture" hint="Take a photo or choose one" savedPath={item?.photoPath}
          value={photo} onChange={v => { setPhoto(v); setError(""); }} onError={setError} />

        {error && <p className="error">{error}</p>}

        <button className="btn primary block" disabled={busy}>{busy ? "Saving…" : item ? "Save changes" : "Add item"}</button>
        {onDelete && (
          <button type="button" className="btn danger-text block" onClick={onDelete}><Icon name="trash" size={16} /> Delete item</button>
        )}
      </form>
    </Sheet>
  );
}

import { useState, type ReactNode } from "react";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";

export function ConfirmDelete({ title, children, confirmLabel, onConfirm, onClose }: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="confirm">
        <div className="confirm-icon"><Icon name="alert-triangle" size={28} /></div>
        <p>{children}</p>
        <p className="warning">This cannot be undone.</p>
        <div className="row">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn danger grow" disabled={busy}
            onClick={async () => { setBusy(true); await onConfirm(); onClose(); }}>
            <Icon name="trash" size={16} /> {busy ? "Deleting…" : confirmLabel}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

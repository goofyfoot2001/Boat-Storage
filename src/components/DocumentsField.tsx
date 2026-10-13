import { useCallback, useEffect, useRef, useState } from "react";
import * as store from "../data/store";
import type { ItemDocument } from "../data/types";
import { fileExt, formatBytes } from "../lib/format";
import { Icon } from "./Icon";

const VIEWABLE = /^(application\/pdf|image\/|text\/plain)/;

/**
 * Documents on an item. For a saved item, files upload as soon as they're picked.
 * For a new (unsaved) item they wait in `queued` and the form uploads them after saving.
 */
export function DocumentsField({ boatId, itemId, queued, onQueue, onChanged, readOnly }: {
  /** Files are kept in the boat's folder so everyone on the boat can open them. */
  boatId: string;
  itemId?: string;
  queued: File[];
  onQueue: (files: File[]) => void;
  /** A document was added or removed on a saved item (so the list can refresh its 📎 count). */
  onChanged?: () => void;
  /** View-only crew can open documents but not add or remove them. */
  readOnly?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [docs, setDocs] = useState<ItemDocument[]>([]);
  const [uploading, setUploading] = useState<string[]>([]);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState("");

  // Which documents are saved on this phone (so they open with no signal).
  const [onPhone, setOnPhone] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!itemId) return;
    const list = await store.listDocuments(itemId);
    setDocs(list);
    const saved = await Promise.all(list.map(async d => [d.id, await store.isDocumentSaved(d)] as const));
    setOnPhone(new Set(saved.filter(([, yes]) => yes).map(([id]) => id)));
  }, [itemId]);
  useEffect(() => { load(); }, [load]);

  async function pick(list: FileList | null) {
    const files = [...(list ?? [])];
    if (!files.length) return;
    setError("");
    const tooBig = files.filter(f => f.size > store.MAX_DOCUMENT_BYTES);
    const ok = files.filter(f => f.size <= store.MAX_DOCUMENT_BYTES);
    if (tooBig.length) setError(`${tooBig.map(f => `“${f.name}”`).join(", ")} ${tooBig.length === 1 ? "is" : "are"} over the 50 MB limit.`);
    if (!itemId) return onQueue([...queued, ...ok]);
    for (const f of ok) {
      setUploading(u => [...u, f.name]);
      try {
        await store.attachDocument(boatId, itemId, f);
      } catch {
        setError(`Couldn't upload “${f.name}”. Please try again.`);
      }
      setUploading(u => u.filter(n => n !== f.name));
    }
    await load();
    onChanged?.();
  }

  async function open(doc: ItemDocument) {
    // PDFs and pictures open in a new tab; Word, Excel and others download or open in the phone's viewer.
    const inTab = !!doc.mimeType && VIEWABLE.test(doc.mimeType);
    const tab = inTab ? window.open("", "_blank") : null; // opened right away so pop-up blockers allow it
    try {
      const url = await store.documentUrl(doc);
      if (tab) tab.location.href = url;
      else if (url.startsWith("blob:")) {
        // Saved on this phone: hand the file over with its real name.
        const a = Object.assign(document.createElement("a"), { href: url, download: doc.name });
        document.body.append(a);
        a.click();
        a.remove();
      } else window.location.href = url;
    } catch {
      tab?.close();
      setError(navigator.onLine ? `Couldn't open “${doc.name}”.` : `“${doc.name}” isn't saved on this phone, so it needs a connection.`);
    }
  }

  async function remove(doc: ItemDocument) {
    setConfirming(null);
    await store.deleteDocument(doc);
    await load();
    onChanged?.();
  }

  return (
    <div className="field">
      <span>Documents <em>(manuals, receipts, spreadsheets…)</em></span>

      {(docs.length > 0 || queued.length > 0 || uploading.length > 0) && (
        <ul className="doc-list">
          {docs.map(doc => (
            <li key={doc.id}>
              <button type="button" className="doc-open" onClick={() => open(doc)}>
                <span className="doc-badge">{fileExt(doc.name)}</span>
                <span className="doc-name">{doc.name}</span>
                <span className="muted">{formatBytes(doc.size)}</span>
                {onPhone.has(doc.id) && <span className="doc-saved" title="Saved on this phone"><Icon name="check" size={14} /></span>}
              </button>
              {readOnly ? null : confirming === doc.id ? (
                <span className="doc-confirm">
                  <button type="button" className="btn small danger" onClick={() => remove(doc)}>Remove</button>
                  <button type="button" className="btn small" onClick={() => setConfirming(null)}>Keep</button>
                </span>
              ) : (
                <button type="button" className="doc-remove" onClick={() => setConfirming(doc.id)} aria-label={`Remove ${doc.name}`}>
                  <Icon name="x" size={16} />
                </button>
              )}
            </li>
          ))}
          {queued.map((f, i) => (
            <li key={`q${i}`}>
              <span className="doc-open">
                <span className="doc-badge">{fileExt(f.name)}</span>
                <span className="doc-name">{f.name}</span>
                <span className="muted">{formatBytes(f.size)}</span>
              </span>
              <button type="button" className="doc-remove" onClick={() => onQueue(queued.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}>
                <Icon name="x" size={16} />
              </button>
            </li>
          ))}
          {uploading.map(n => (
            <li key={`u${n}`} className="doc-uploading">
              <span className="doc-open"><span className="doc-badge">{fileExt(n)}</span><span className="doc-name">{n}</span><span className="muted">Uploading…</span></span>
            </li>
          ))}
        </ul>
      )}
      {queued.length > 0 && <small className="field-hint">These upload when you save the item.</small>}

      {readOnly && docs.length === 0 && <p className="muted">No documents.</p>}
      {!readOnly && (
        <button type="button" className="btn block" onClick={() => fileRef.current?.click()}>
          <Icon name="paperclip" size={17} /> Attach document
        </button>
      )}
      <input ref={fileRef} type="file" multiple hidden onChange={e => { pick(e.target.files); e.target.value = ""; }} />
      {error && <p className="error">{error}</p>}
    </div>
  );
}

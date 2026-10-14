// Everything the screens need to read and change data goes through here.
// Row Level Security in Supabase makes sure each user only ever reaches their own rows and photos.
// With no signal, reads fall back to the copy of a boat saved on this device (see "Offline" below).
import { canThumb, makeDocThumb } from "../lib/docThumb";
import * as local from "./offlineDb";
import { supabase } from "./supabase";
import type { Boat, Container, Deck, Item, ItemDocument, Location } from "./types";

const PHOTOS = "photos";

/** The network couldn't be reached. */
export class OfflineError extends Error {}

const NETWORK_ERROR = /failed to fetch|networkerror|load failed|network request failed|fetch failed/i;

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) {
    if (!navigator.onLine || NETWORK_ERROR.test(res.error.message)) throw new OfflineError("You're offline.");
    throw new Error(res.error.message);
  }
  return res.data;
}

/** Read from Supabase; if there's no connection, read the saved copy on this device instead. */
async function readOr<T>(online: () => Promise<T>, offline: () => Promise<T>): Promise<T> {
  if (!navigator.onLine) return offline();
  try {
    return await online();
  } catch (err) {
    if (err instanceof OfflineError || (err instanceof TypeError && NETWORK_ERROR.test(err.message))) return offline();
    throw err;
  }
}

// ── Auth ────────────────────────────────────────────────────────────────────

export interface Session {
  userId: string;
  email: string;
}

export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { emailRedirectTo: new URL(import.meta.env.BASE_URL, window.location.origin).href },
  });
  if (error) throw new Error(error.message);
  // No session means Supabase wants the email address confirmed first.
  return { needsConfirmation: !data.session };
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) {
    if (/confirm/i.test(error.message)) throw new Error("Please confirm your email first. Check your inbox for the link.");
    throw new Error("Email or password is incorrect.");
  }
}

/**
 * Email a link for choosing a new password. Opening the link signs the person in and the app
 * then asks for the new password. (Says nothing about whether the email has an account.)
 */
export async function requestPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: new URL(import.meta.env.BASE_URL, window.location.origin).href,
  });
  if (error) {
    if (/rate limit|seconds/i.test(error.message)) throw new Error("Too many requests. Please wait a minute and try again.");
    throw new Error("Couldn't send the email. Please check the address and try again.");
  }
}

export async function setNewPassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (/different from the old/i.test(error.message)) throw new Error("Please choose a password different from your old one.");
    throw new Error(error.message);
  }
}

export async function signOut() {
  await supabase.auth.signOut();
}

// ── Photos ──────────────────────────────────────────────────────────────────

const urlCache = new Map<string, { url: string; expires: number }>();

/**
 * Photos are private, so each one is shown through a short-lived signed link — or, if it's
 * saved on this device for offline use, straight from there (faster, and works without signal).
 */
export async function photoUrl(path: string) {
  const hit = urlCache.get(path);
  if (hit && hit.expires > Date.now()) return hit.url;
  const saved = await savedFileUrl(PHOTOS, path);
  if (saved) return saved;
  if (!navigator.onLine) throw new OfflineError("Photo not saved on this device.");
  const signedUrl = check(await supabase.storage.from(PHOTOS).createSignedUrl(path, 3600))!.signedUrl;
  urlCache.set(path, { url: signedUrl, expires: Date.now() + 50 * 60_000 });
  return signedUrl;
}

/** Files are kept per boat, so everyone on the boat can see them. */
async function uploadPhoto(boatId: string, blob: Blob) {
  const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
  const path = `boats/${boatId}/${crypto.randomUUID()}.${ext}`;
  check(await supabase.storage.from(PHOTOS).upload(path, blob, { contentType: blob.type || "image/jpeg" }));
  return path;
}

async function removePhotos(paths: (string | null)[]) {
  const real = paths.filter((p): p is string => !!p);
  if (real.length) await supabase.storage.from(PHOTOS).remove(real);
  real.forEach(p => urlCache.delete(p));
}

const DOCUMENTS = "documents";

/** Document files and their preview pictures (which live in the photos bucket). */
interface DocFiles { docs: string[]; thumbs: (string | null)[] }

async function removeDocs({ docs, thumbs }: DocFiles) {
  if (docs.length) await supabase.storage.from(DOCUMENTS).remove(docs);
  await removePhotos(thumbs);
}

/** Every document (and preview) attached to these items, so they can be cleared out of storage. */
async function docPathsForItems(itemIds: string[]): Promise<DocFiles> {
  if (!itemIds.length) return { docs: [], thumbs: [] };
  const rows = check(await supabase.from("item_documents").select("path, thumb_path").in("item_id", itemIds)) as
    { path: string; thumb_path: string | null }[];
  return { docs: rows.map(r => r.path), thumbs: rows.map(r => r.thumb_path) };
}

/** photo: a new Blob replaces the old one, null removes it, undefined leaves it alone. */
async function replacePhoto(boatId: string, oldPath: string | null, photo: Blob | null | undefined) {
  if (photo === undefined) return oldPath;
  const next = photo ? await uploadPhoto(boatId, photo) : null;
  await removePhotos([oldPath]);
  return next;
}

// ── Boats ───────────────────────────────────────────────────────────────────

interface BoatRow { id: string; user_id: string; name: string; photo_path: string | null; sort_order: number }
const toBoat = (r: BoatRow): Boat => ({ id: r.id, userId: r.user_id, name: r.name, photoPath: r.photo_path, sortOrder: r.sort_order });

export async function listBoats() {
  return readOr(async () => {
    const rows = check(await supabase.from("boats").select("*").order("sort_order").order("created_at"));
    return (rows as BoatRow[]).map(toBoat);
  }, async () => (await snapshots()).map(s => s.boat).sort((a, b) => a.sort_order - b.sort_order).map(toBoat));
}

/** Number of decks on each boat, keyed by boat id. */
export async function deckCounts() {
  return readOr(async () => {
    const rows = check(await supabase.from("decks").select("boat_id")) as { boat_id: string }[];
    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.boat_id] = (counts[r.boat_id] ?? 0) + 1;
    return counts;
  }, async () => Object.fromEntries((await snapshots()).map(s => [s.boatId, s.decks.length])));
}

export async function getBoat(id: string) {
  return readOr(async () => {
    const row = check(await supabase.from("boats").select("*").eq("id", id).maybeSingle());
    return row ? toBoat(row as BoatRow) : undefined;
  }, async () => {
    const s = await snapshot(id);
    return s && toBoat(s.boat);
  });
}

export async function addBoat(name: string, photo: Blob | null, sortOrder: number) {
  // The id is made here so the photo can go straight into the new boat's folder. (The database makes
  // the creator the owner as the boat is saved, which is what then allows the upload.)
  const id = crypto.randomUUID();
  check(await supabase.from("boats").insert({ id, name: name.trim(), sort_order: sortOrder }));
  if (photo) {
    const photo_path = await uploadPhoto(id, photo);
    check(await supabase.from("boats").update({ photo_path }).eq("id", id));
  }
}

export async function updateBoat(boat: Boat, name: string, photo: Blob | null | undefined) {
  const photo_path = await replacePhoto(boat.id, boat.photoPath, photo);
  check(await supabase.from("boats").update({ name: name.trim(), photo_path }).eq("id", boat.id));
}

export async function deleteBoat(boat: Boat) {
  // The database removes the boat's decks, locations and items on its own;
  // their photos have to be cleared out of storage separately.
  const decks = check(await supabase.from("decks").select("id, photo_path").eq("boat_id", boat.id)) as { id: string; photo_path: string | null }[];
  const files = await filesOnDecks(decks.map(d => d.id));
  check(await supabase.from("boats").delete().eq("id", boat.id));
  await removePhotos([boat.photoPath, ...decks.map(d => d.photo_path), ...files.photos]);
  await removeDocs(files.docs);
}

export async function reorderBoats(boats: Boat[]) {
  await Promise.all(boats.map((b, i) => supabase.from("boats").update({ sort_order: i }).eq("id", b.id)));
}

// ── Decks ───────────────────────────────────────────────────────────────────

interface DeckRow { id: string; user_id: string; boat_id: string; name: string; photo_path: string | null; sort_order: number; locations?: { count: number }[] }
const toDeck = (r: DeckRow): Deck => ({
  id: r.id, userId: r.user_id, boatId: r.boat_id, name: r.name, photoPath: r.photo_path, sortOrder: r.sort_order,
  locationCount: r.locations?.[0]?.count ?? 0,
});

export async function listDecks(boatId: string) {
  return readOr(async () => {
    const rows = check(await supabase.from("decks").select("*, locations(count)").eq("boat_id", boatId).order("sort_order").order("created_at"));
    return (rows as DeckRow[]).map(toDeck);
  }, async () => {
    const s = await snapshot(boatId);
    if (!s) return [];
    return [...s.decks].sort((a, b) => a.sort_order - b.sort_order)
      .map(d => toDeck({ ...d, locations: [{ count: s.locations.filter(l => l.deck_id === d.id).length }] }));
  });
}

export async function getDeck(id: string) {
  return readOr(async () => {
    const row = check(await supabase.from("decks").select("*").eq("id", id).maybeSingle());
    return row ? toDeck(row as DeckRow) : undefined;
  }, async () => {
    const d = (await snapshots()).flatMap(s => s.decks).find(x => x.id === id);
    return d && toDeck(d);
  });
}

export async function addDeck(boatId: string, name: string, photo: Blob | null, sortOrder: number) {
  const photo_path = photo ? await uploadPhoto(boatId, photo) : null;
  check(await supabase.from("decks").insert({ boat_id: boatId, name: name.trim(), photo_path, sort_order: sortOrder }));
}

export async function updateDeck(deck: Deck, name: string, photo: Blob | null | undefined) {
  const photo_path = await replacePhoto(deck.boatId, deck.photoPath, photo);
  check(await supabase.from("decks").update({ name: name.trim(), photo_path }).eq("id", deck.id));
}

export async function deleteDeck(deck: Deck) {
  const files = await filesOnDecks([deck.id]);
  check(await supabase.from("decks").delete().eq("id", deck.id));
  await removePhotos([deck.photoPath, ...files.photos]);
  await removeDocs(files.docs);
}

export async function reorderDecks(decks: Deck[]) {
  await Promise.all(decks.map((d, i) => supabase.from("decks").update({ sort_order: i }).eq("id", d.id)));
}

/** Photos and documents of every location, container and item on these decks, so they can be cleared out of storage. */
async function filesOnDecks(deckIds: string[]): Promise<{ photos: (string | null)[]; docs: DocFiles }> {
  if (!deckIds.length) return { photos: [], docs: { docs: [], thumbs: [] } };
  type Row = {
    photo_path: string | null;
    items: { photo_path: string | null; item_documents: { path: string; thumb_path: string | null }[] }[];
    containers: { photo_path: string | null }[];
  };
  const rows = check(await supabase.from("locations")
    .select("photo_path, items(photo_path, item_documents(path, thumb_path)), containers(photo_path)")
    .in("deck_id", deckIds)) as Row[];
  const docs = rows.flatMap(r => r.items.flatMap(i => i.item_documents));
  return {
    photos: rows.flatMap(r => [r.photo_path, ...r.items.map(i => i.photo_path), ...r.containers.map(c => c.photo_path)]),
    docs: { docs: docs.map(d => d.path), thumbs: docs.map(d => d.thumb_path) },
  };
}

// ── Storage locations ───────────────────────────────────────────────────────

interface LocationRow {
  id: string; user_id: string; boat_id: string; deck_id: string; name: string; x: number; y: number; color: string;
  photo_path: string | null; items?: { count: number }[];
}
const toLocation = (r: LocationRow): Location => ({
  id: r.id, userId: r.user_id, boatId: r.boat_id, deckId: r.deck_id, name: r.name, x: r.x, y: r.y, color: r.color,
  photoPath: r.photo_path, itemCount: r.items?.[0]?.count ?? 0,
});

export async function listLocations(deckId: string) {
  return readOr(async () => {
    const rows = check(await supabase.from("locations").select("*, items(count)").eq("deck_id", deckId).order("name"));
    return (rows as LocationRow[]).map(toLocation);
  }, async () => {
    const s = (await snapshots()).find(x => x.decks.some(d => d.id === deckId));
    if (!s) return [];
    return s.locations.filter(l => l.deck_id === deckId).sort(byName)
      .map(l => toLocation({ ...l, items: [{ count: s.items.filter(i => i.location_id === l.id).length }] }));
  });
}

export async function getLocation(id: string) {
  return readOr(async () => {
    const row = check(await supabase.from("locations").select("*").eq("id", id).maybeSingle());
    return row ? toLocation(row as LocationRow) : undefined;
  }, async () => {
    const l = (await snapshots()).flatMap(s => s.locations).find(x => x.id === id);
    return l && toLocation(l);
  });
}

export interface LocationFields { name: string; color: string }

export async function addLocation(boatId: string, deckId: string, x: number, y: number, f: LocationFields, photo: Blob | null) {
  const photo_path = photo ? await uploadPhoto(boatId, photo) : null;
  const row = check(await supabase.from("locations")
    .insert({ deck_id: deckId, x, y, name: f.name.trim(), color: f.color, photo_path }).select().single());
  return toLocation(row as LocationRow);
}

export async function updateLocation(loc: Location, f: LocationFields, photo: Blob | null | undefined) {
  const photo_path = await replacePhoto(loc.boatId, loc.photoPath, photo);
  check(await supabase.from("locations").update({ name: f.name.trim(), color: f.color, photo_path }).eq("id", loc.id));
}

export async function moveLocation(id: string, x: number, y: number) {
  check(await supabase.from("locations").update({ x, y }).eq("id", id));
}

export async function deleteLocation(loc: Location) {
  const [items, containers] = await Promise.all([listItems(loc.id), listContainers(loc.id)]);
  const docs = await docPathsForItems(items.map(i => i.id));
  check(await supabase.from("locations").delete().eq("id", loc.id));
  await removePhotos([loc.photoPath, ...items.map(i => i.photoPath), ...containers.map(c => c.photoPath)]);
  await removeDocs(docs);
}

// ── Containers ──────────────────────────────────────────────────────────────

interface ContainerRow {
  id: string; user_id: string; boat_id: string; location_id: string; parent_id: string | null; name: string;
  notes: string | null; color: string; photo_path: string | null;
}
const toContainer = (r: ContainerRow): Container => ({
  id: r.id, userId: r.user_id, boatId: r.boat_id, locationId: r.location_id, parentId: r.parent_id, name: r.name,
  notes: r.notes ?? "", color: r.color, photoPath: r.photo_path,
});

export async function listContainers(locationId: string) {
  return readOr(async () => {
    const rows = check(await supabase.from("containers").select("*").eq("location_id", locationId).order("name"));
    return (rows as ContainerRow[]).map(toContainer);
  }, async () => (await snapshots()).flatMap(s => s.containers).filter(c => c.location_id === locationId).sort(byName).map(toContainer));
}

export interface ContainerFields { name: string; notes: string; color: string }

const containerColumns = (f: ContainerFields) => ({ name: f.name.trim(), notes: f.notes.trim() || null, color: f.color });

export async function addContainer(boatId: string, locationId: string, parentId: string | null, f: ContainerFields, photo: Blob | null) {
  const photo_path = photo ? await uploadPhoto(boatId, photo) : null;
  check(await supabase.from("containers").insert({ location_id: locationId, parent_id: parentId, ...containerColumns(f), photo_path }));
}

export async function updateContainer(c: Container, f: ContainerFields, photo: Blob | null | undefined) {
  const photo_path = await replacePhoto(c.boatId, c.photoPath, photo);
  check(await supabase.from("containers").update({ ...containerColumns(f), photo_path }).eq("id", c.id));
}

/** `c` and every container inside it, parents before children. */
export function subtree(c: Container, all: Container[]): Container[] {
  const out = [c];
  for (let i = 0; i < out.length; i++) out.push(...all.filter(x => x.parentId === out[i].id));
  return out;
}

/**
 * Put a container (with everything in it) somewhere else: another container, the location
 * itself, or a different location. `siblings` is every container in its current location.
 */
export async function moveContainer(c: Container, to: { locationId: string; parentId: string | null }, siblings: Container[]) {
  const tree = subtree(c, siblings);
  if (to.parentId && tree.some(t => t.id === to.parentId)) throw new Error("A container can't go inside itself.");
  check(await supabase.from("containers").update({ location_id: to.locationId, parent_id: to.parentId }).eq("id", c.id));
  if (to.locationId === c.locationId) return;
  // Changing location: the security rules want each container's parent to be in the same location,
  // so move the rest one at a time, parents first, then the items inside them.
  for (const t of tree.slice(1)) check(await supabase.from("containers").update({ location_id: to.locationId }).eq("id", t.id));
  check(await supabase.from("items").update({ location_id: to.locationId }).in("container_id", tree.map(t => t.id)));
}

/**
 * Delete a container. "keep" moves what's inside out one level (into its parent container or the
 * location); "all" deletes everything inside it too.
 */
export async function deleteContainer(c: Container, mode: "keep" | "all", siblings: Container[], items: Item[]) {
  if (mode === "keep") {
    check(await supabase.from("items").update({ container_id: c.parentId }).eq("container_id", c.id));
    check(await supabase.from("containers").update({ parent_id: c.parentId }).eq("parent_id", c.id));
    check(await supabase.from("containers").delete().eq("id", c.id));
    await removePhotos([c.photoPath]);
    return;
  }
  const tree = subtree(c, siblings);
  const ids = new Set(tree.map(t => t.id));
  const inside = items.filter(i => i.containerId && ids.has(i.containerId));
  const docs = await docPathsForItems(inside.map(i => i.id));
  check(await supabase.from("containers").delete().eq("id", c.id)); // the database removes everything inside
  await removePhotos([...tree.map(t => t.photoPath), ...inside.map(i => i.photoPath)]);
  await removeDocs(docs);
}

// ── Stored items ────────────────────────────────────────────────────────────

interface ItemRow {
  id: string; user_id: string; boat_id: string; location_id: string; container_id: string | null; name: string; quantity: number;
  price: number | string | null; notes: string | null; photo_path: string | null;
  item_documents?: { id: string; name: string }[];
}
const toItem = (r: ItemRow): Item => ({
  id: r.id, userId: r.user_id, boatId: r.boat_id, locationId: r.location_id, containerId: r.container_id ?? null, name: r.name,
  quantity: r.quantity, price: r.price === null ? null : Number(r.price), notes: r.notes ?? "", photoPath: r.photo_path,
  docs: r.item_documents ?? [],
});

/** Item columns plus the names of attached documents (for the 📎 count and search). */
const ITEM_SELECT = "*, item_documents(id, name)";

export async function listItems(locationId: string) {
  return readOr(async () => {
    const rows = check(await supabase.from("items").select(ITEM_SELECT).eq("location_id", locationId).order("name"));
    return (rows as ItemRow[]).map(toItem);
  }, async () => (await snapshots()).flatMap(s => s.items).filter(i => i.location_id === locationId).sort(byName).map(toItem));
}

export interface ItemFields {
  name: string; quantity: number; price: number | null; notes: string;
  /** Set to put the item somewhere else: a location, and optionally a container in it. */
  place?: { locationId: string; containerId: string | null };
}

const itemColumns = (f: ItemFields) => ({
  name: f.name.trim(), quantity: f.quantity, price: f.price, notes: f.notes.trim() || null,
  ...(f.place ? { location_id: f.place.locationId, container_id: f.place.containerId } : {}),
});

// ── Everything on one boat (search, moving things) ──────────────────────────

export interface BoatContents {
  decks: { id: string; name: string }[];
  locations: { id: string; name: string; color: string; deckId: string; deckName: string }[];
  containers: Container[];
  items: Item[];
}

export async function boatContents(boatId: string): Promise<BoatContents> {
  return readOr(() => boatContentsOnline(boatId), async () => {
    const s = await snapshot(boatId);
    if (!s) return { decks: [], locations: [], containers: [], items: [] };
    const decks = [...s.decks].sort((a, b) => a.sort_order - b.sort_order);
    const deckName = new Map(decks.map(d => [d.id, d.name]));
    return {
      decks: decks.map(d => ({ id: d.id, name: d.name })),
      locations: s.locations.map(l => ({ id: l.id, name: l.name, color: l.color, deckId: l.deck_id, deckName: deckName.get(l.deck_id) ?? "" }))
        .sort((a, b) => a.deckName.localeCompare(b.deckName) || a.name.localeCompare(b.name)),
      containers: [...s.containers].sort(byName).map(toContainer),
      items: s.items.map(toItem),
    };
  });
}

async function boatContentsOnline(boatId: string): Promise<BoatContents> {
  const rows = check(await supabase.from("decks")
    .select(`id, name, sort_order, locations(id, name, color, items(${ITEM_SELECT}), containers(*))`)
    .eq("boat_id", boatId).order("sort_order")) as {
      id: string; name: string;
      locations: { id: string; name: string; color: string; items: ItemRow[]; containers: ContainerRow[] }[];
    }[];
  return {
    decks: rows.map(d => ({ id: d.id, name: d.name })),
    locations: rows.flatMap(d => d.locations.map(l => ({ id: l.id, name: l.name, color: l.color, deckId: d.id, deckName: d.name })))
      .sort((a, b) => a.deckName.localeCompare(b.deckName) || a.name.localeCompare(b.name)),
    containers: rows.flatMap(d => d.locations.flatMap(l => l.containers.map(toContainer)))
      .sort((a, b) => a.name.localeCompare(b.name)),
    items: rows.flatMap(d => d.locations.flatMap(l => l.items.map(toItem))),
  };
}

/** Returns the new item's id, so documents picked before saving can be attached to it. */
export async function addItem(boatId: string, locationId: string, containerId: string | null, f: ItemFields, photo: Blob | null) {
  const photo_path = photo ? await uploadPhoto(boatId, photo) : null;
  const row = check(await supabase.from("items")
    .insert({ location_id: locationId, container_id: containerId, ...itemColumns(f), photo_path }).select("id").single());
  return (row as { id: string }).id;
}

export async function updateItem(item: Item, f: ItemFields, photo: Blob | null | undefined) {
  const photo_path = await replacePhoto(item.boatId, item.photoPath, photo);
  check(await supabase.from("items").update({ ...itemColumns(f), photo_path }).eq("id", item.id));
}

export async function deleteItem(item: Item) {
  const docs = await docPathsForItems([item.id]);
  check(await supabase.from("items").delete().eq("id", item.id));
  await removePhotos([item.photoPath]);
  await removeDocs(docs);
}

// ── Documents attached to items ─────────────────────────────────────────────

/** Supabase's free plan accepts uploads up to 50 MB. */
export const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;

interface DocumentRow {
  id: string; item_id: string; name: string; path: string; size: number; mime_type: string | null; thumb_path: string | null;
}
const toDocument = (r: DocumentRow): ItemDocument => ({
  id: r.id, itemId: r.item_id, name: r.name, path: r.path, size: Number(r.size), mimeType: r.mime_type,
  thumbPath: r.thumb_path ?? null,
});

/** Make and upload a small preview for a document (pictures and PDFs only). */
async function uploadDocThumb(boatId: string, file: Blob, mime: string | null) {
  if (!canThumb(mime)) return null;
  const thumb = await makeDocThumb(file, mime);
  if (!thumb) return null;
  const path = `boats/${boatId}/thumbs/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(PHOTOS).upload(path, thumb, { contentType: "image/jpeg" });
  return error ? null : path;
}

/**
 * Give an older document its preview (documents uploaded before previews existed).
 * Returns true if one was added.
 */
export async function addMissingDocThumb(boatId: string, doc: ItemDocument) {
  if (doc.thumbPath || !canThumb(doc.mimeType) || !navigator.onLine) return false;
  const { data } = await supabase.storage.from(DOCUMENTS).download(doc.path);
  if (!data) return false;
  const thumb_path = await uploadDocThumb(boatId, data, doc.mimeType);
  if (!thumb_path) return false;
  const { error } = await supabase.from("item_documents").update({ thumb_path }).eq("id", doc.id);
  if (error) { await removePhotos([thumb_path]); return false; }
  return true;
}

export async function listDocuments(itemId: string) {
  return readOr(async () => {
    const rows = check(await supabase.from("item_documents").select("*").eq("item_id", itemId).order("name"));
    return (rows as DocumentRow[]).map(toDocument);
  }, async () => (await snapshots()).flatMap(s => s.documents).filter(d => d.item_id === itemId).sort(byName).map(toDocument));
}

export async function attachDocument(boatId: string, itemId: string, file: File) {
  if (file.size > MAX_DOCUMENT_BYTES) throw new Error(`“${file.name}” is bigger than 50 MB.`);
  const ext = /\.([a-z0-9]{1,8})$/i.exec(file.name)?.[1]?.toLowerCase();
  // Stored under a random name; the original file name is kept in the database for display.
  const path = `boats/${boatId}/docs/${itemId}/${crypto.randomUUID()}${ext ? `.${ext}` : ""}`;
  check(await supabase.storage.from(DOCUMENTS).upload(path, file, { contentType: file.type || "application/octet-stream" }));
  const thumb_path = await uploadDocThumb(boatId, file, file.type || null);
  const { error } = await supabase.from("item_documents").insert({
    item_id: itemId, name: file.name.slice(0, 255), path, size: file.size, mime_type: file.type || null, thumb_path,
  });
  if (error) {
    await removeDocs({ docs: [path], thumbs: [thumb_path] }); // don't leave orphaned files behind
    throw new Error(error.message);
  }
}

export async function deleteDocument(doc: ItemDocument) {
  check(await supabase.from("item_documents").delete().eq("id", doc.id));
  await removeDocs({ docs: [doc.path], thumbs: [doc.thumbPath] });
}

/** Types a browser can show by itself; everything else is downloaded / handed to the phone's viewer. */
const VIEWABLE = /^(application\/pdf|image\/|text\/plain)/;

/** Whether this document is saved on this device (so it opens without signal). */
export async function isDocumentSaved(doc: ItemDocument) {
  return !!(await local.get(FILES, local.fileKey(DOCUMENTS, doc.path)));
}

/** A link to open or download the document: from this device if saved there, otherwise a short-lived private link. */
export async function documentUrl(doc: ItemDocument) {
  const saved = await savedFileUrl(DOCUMENTS, doc.path);
  if (saved) return saved;
  if (!navigator.onLine) throw new OfflineError("This document isn't saved on this device.");
  const viewInBrowser = !!doc.mimeType && VIEWABLE.test(doc.mimeType);
  const res = await supabase.storage.from(DOCUMENTS)
    .createSignedUrl(doc.path, 600, viewInBrowser ? undefined : { download: doc.name });
  return check(res)!.signedUrl;
}

// ── Sharing a boat: crew and invites ────────────────────────────────────────

export type BoatRole = "owner" | "crew" | "viewer";

/** Owner and crew can change things; viewers can only look. */
export const canEdit = (role: BoatRole | null | undefined) => role === "owner" || role === "crew";

export interface CrewMember { userId: string; email: string; role: BoatRole; joinedAt: string }

export interface Invite { id: string; boatId: string; email: string; role: BoatRole; token: string; createdAt: string; expiresAt: string }

interface InviteRow { id: string; boat_id: string; email: string; role: BoatRole; token: string; created_at: string; expires_at: string }
const toInvite = (r: InviteRow): Invite => ({
  id: r.id, boatId: r.boat_id, email: r.email, role: r.role, token: r.token, createdAt: r.created_at, expiresAt: r.expires_at,
});

/** The signed-in person's role on every boat they can see. */
export async function myRoles(userId: string): Promise<Record<string, BoatRole>> {
  return readOr(async () => {
    const rows = check(await supabase.from("boat_members").select("boat_id, role").eq("user_id", userId)) as { boat_id: string; role: BoatRole }[];
    return Object.fromEntries(rows.map(r => [r.boat_id, r.role]));
  }, async () => Object.fromEntries((await snapshots()).map(s => [s.boatId, s.role])));
}

export async function myRole(userId: string, boatId: string): Promise<BoatRole | null> {
  return readOr(async () => {
    const row = check(await supabase.from("boat_members").select("role").eq("boat_id", boatId).eq("user_id", userId).maybeSingle());
    return (row as { role: BoatRole } | null)?.role ?? null;
  }, async () => (await snapshot(boatId))?.role ?? null);
}

/** Everyone on a boat, owner first. */
export async function boatCrew(boatId: string): Promise<CrewMember[]> {
  return readOr(async () => {
    const rows = check(await supabase.rpc("boat_crew", { b: boatId })) as { user_id: string; email: string; role: BoatRole; joined_at: string }[];
    return rows.map(r => ({ userId: r.user_id, email: r.email, role: r.role, joinedAt: r.joined_at }));
  }, async () => (await snapshot(boatId))?.crew ?? []);
}

export async function setCrewRole(boatId: string, userId: string, role: "crew" | "viewer") {
  check(await supabase.from("boat_members").update({ role }).eq("boat_id", boatId).eq("user_id", userId));
}

/** Owner removing someone, or someone leaving (pass your own id). */
export async function removeCrew(boatId: string, userId: string) {
  check(await supabase.from("boat_members").delete().eq("boat_id", boatId).eq("user_id", userId));
}

/** Invites the owner has sent that haven't been accepted yet. */
export async function pendingInvites(boatId: string) {
  return readOr(async () => {
    const rows = check(await supabase.from("boat_invites").select("*").eq("boat_id", boatId).is("accepted_at", null).order("created_at"));
    return (rows as InviteRow[]).map(toInvite);
  }, async () => [] as Invite[]);
}

export async function createInvite(boatId: string, email: string, role: "crew" | "viewer") {
  const clean = email.trim().toLowerCase();
  const { data, error } = await supabase.from("boat_invites").insert({ boat_id: boatId, email: clean, role }).select().single();
  if (error) {
    if (error.code === "23505") throw new Error(`${clean} already has an invite waiting. You can share that one again below.`);
    throw new Error("Couldn't create the invite. Check the email address and try again.");
  }
  return toInvite(data as InviteRow);
}

export async function cancelInvite(id: string) {
  check(await supabase.from("boat_invites").delete().eq("id", id));
}

/** The link to send; opening it leads to sign in / sign up and then accepting. */
export const inviteLink = (token: string) => new URL(`${import.meta.env.BASE_URL}invite/${token}`, window.location.origin).href;

export interface InviteInfo { boatName: string; email: string; role: BoatRole; invitedBy: string | null; status: "pending" | "accepted" | "expired" }

/** What an invite link is for (works before signing in). Undefined if the link isn't valid. */
export async function inviteInfo(token: string): Promise<InviteInfo | undefined> {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return undefined;
  const rows = check(await supabase.rpc("invite_info", { invite_token: token })) as
    { boat_name: string; email: string; role: BoatRole; invited_by: string | null; status: InviteInfo["status"] }[];
  const r = rows[0];
  return r && { boatName: r.boat_name, email: r.email, role: r.role, invitedBy: r.invited_by, status: r.status };
}

/** Accept as the signed-in person; returns the boat id. Throws a readable message if it can't. */
export async function acceptInvite(token: string): Promise<string> {
  const { data, error } = await supabase.rpc("accept_invite", { invite_token: token });
  if (error) throw new Error(error.message);
  return data as string;
}

/** Invites waiting for the signed-in person (matched by their email), with the boat name. */
export async function myInvites(email: string) {
  return readOr(async () => {
    const rows = check(await supabase.from("boat_invites").select("*").eq("email", email.toLowerCase()).is("accepted_at", null)) as InviteRow[];
    const live = rows.map(toInvite).filter(i => new Date(i.expiresAt) > new Date());
    return Promise.all(live.map(async i => ({ invite: i, info: await inviteInfo(i.token) })));
  }, async () => []);
}

export async function declineInvite(id: string) {
  check(await supabase.from("boat_invites").delete().eq("id", id));
}

// ── Offline: a copy of chosen boats kept on this device ─────────────────────
// Turned on per boat ("Keep on this phone"). Whenever there's a connection the copy is refreshed;
// with no connection, the reads above fall back to it. Changes still need a connection.

const FILES = "files";
const SETTINGS_KEY = "bsm-offline-boats";

/** What to keep on the device for a boat. Deck layout pictures are always kept (the pins need them). */
export interface OfflineOptions { photos: boolean; docs: boolean }

interface Snapshot {
  boatId: string;
  savedAt: number;
  boat: BoatRow;
  decks: DeckRow[];
  locations: LocationRow[];
  containers: ContainerRow[];
  items: ItemRow[];
  documents: DocumentRow[];
  role: BoatRole;
  crew: CrewMember[];
  /** Storage keys of the files kept for this boat. */
  fileKeys: string[];
}

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);

let snapCache: Snapshot[] | null = null;
async function snapshots() {
  snapCache ??= await local.getAll<Snapshot>("snapshots").catch(() => []);
  return snapCache;
}
async function snapshot(boatId: string) {
  return (await snapshots()).find(s => s.boatId === boatId);
}

const fileUrls = new Map<string, string>();
/** A local link to a file saved on this device, or undefined if it isn't saved. */
async function savedFileUrl(bucket: string, path: string) {
  const key = local.fileKey(bucket, path);
  const hit = fileUrls.get(key);
  if (hit) return hit;
  const saved = await local.get<local.SavedFile>(FILES, key).catch(() => undefined);
  if (!saved) return undefined;
  const url = URL.createObjectURL(saved.blob);
  fileUrls.set(key, url);
  return url;
}

/** Which boats are kept on this device, and what for each (remembered on this device only). */
export function offlineSettings(): Record<string, OfflineOptions> {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}"); } catch { return {}; }
}
function setOfflineSettings(s: Record<string, OfflineOptions>) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* storage blocked */ }
}

export interface OfflineStatus { savedAt: number; bytes: number; files: number; options: OfflineOptions }

export async function offlineStatus(boatId: string): Promise<OfflineStatus | undefined> {
  const options = offlineSettings()[boatId];
  const s = await snapshot(boatId);
  if (!options || !s) return undefined;
  const files = await Promise.all(s.fileKeys.map(k => local.get<local.SavedFile>(FILES, k)));
  return { savedAt: s.savedAt, files: s.fileKeys.length, bytes: files.reduce((n, f) => n + (f?.size ?? 0), 0), options };
}

/** When the newest saved copy was made (for the "offline" banner). */
export async function lastSavedAt() {
  const all = await snapshots();
  return all.length ? Math.max(...all.map(s => s.savedAt)) : undefined;
}

/** What a full download would include, to show before saving. */
export async function offlineEstimate(boatId: string) {
  const [items, docs, locations, containers] = await Promise.all([
    supabase.from("items").select("photo_path").eq("boat_id", boatId).not("photo_path", "is", null),
    supabase.from("item_documents").select("size").eq("boat_id", boatId),
    supabase.from("locations").select("photo_path").eq("boat_id", boatId).not("photo_path", "is", null),
    supabase.from("containers").select("photo_path").eq("boat_id", boatId).not("photo_path", "is", null),
  ]);
  const photoCount = [items, locations, containers].reduce((n, r) => n + (check(r) as unknown[]).length, 0);
  const docRows = check(docs) as { size: number }[];
  return { photos: photoCount, docs: docRows.length, docBytes: docRows.reduce((n, d) => n + Number(d.size), 0) };
}

/**
 * Download (or refresh) the copy of a boat on this device. Only files not already saved are
 * downloaded, so refreshing is quick. `onProgress` gets (files done, files to fetch).
 */
export async function saveBoatOffline(boatId: string, userId: string, options: OfflineOptions,
  onProgress?: (done: number, total: number) => void) {
  setOfflineSettings({ ...offlineSettings(), [boatId]: options });
  // Ask the browser not to clear this data when space runs low (not all browsers allow it).
  navigator.storage?.persist?.().catch(() => {});

  const [boat, decks, locations, containers, items, documents, role, crew] = await Promise.all([
    supabase.from("boats").select("*").eq("id", boatId).single(),
    supabase.from("decks").select("*").eq("boat_id", boatId),
    supabase.from("locations").select("*").eq("boat_id", boatId),
    supabase.from("containers").select("*").eq("boat_id", boatId),
    supabase.from("items").select(ITEM_SELECT).eq("boat_id", boatId),
    supabase.from("item_documents").select("*").eq("boat_id", boatId),
    myRole(userId, boatId),
    boatCrew(boatId),
  ]);
  const snap: Snapshot = {
    boatId, savedAt: Date.now(), role: role ?? "viewer", crew, fileKeys: [],
    boat: check(boat) as BoatRow, decks: check(decks) as DeckRow[], locations: check(locations) as LocationRow[],
    containers: check(containers) as ContainerRow[], items: check(items) as ItemRow[], documents: check(documents) as DocumentRow[],
  };

  // Which files to keep: deck layouts always; other photos and documents if chosen.
  const wanted: [string, string][] = snap.decks.filter(d => d.photo_path).map(d => [PHOTOS, d.photo_path!]);
  if (options.photos) {
    const paths = [snap.boat.photo_path, ...snap.locations.map(l => l.photo_path), ...snap.containers.map(c => c.photo_path), ...snap.items.map(i => i.photo_path)];
    for (const p of paths) if (p) wanted.push([PHOTOS, p]);
  }
  if (options.docs) for (const d of snap.documents) wanted.push([DOCUMENTS, d.path]);
  // Document previews are tiny; keep them whenever photos or documents are kept.
  if (options.docs || options.photos) for (const d of snap.documents) if (d.thumb_path) wanted.push([PHOTOS, d.thumb_path]);

  const have = new Set(await local.allKeys(FILES));
  const missing = wanted.filter(([b, p]) => !have.has(local.fileKey(b, p)));
  let done = 0;
  onProgress?.(0, missing.length);
  // A few at a time, so one big manual doesn't hold everything up.
  const queue = [...missing];
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const [bucket, path] = next;
      const { data, error } = await supabase.storage.from(bucket).download(path);
      if (!error && data) await local.put<local.SavedFile>(FILES, { key: local.fileKey(bucket, path), blob: data, size: data.size });
      onProgress?.(++done, missing.length);
    }
  };
  await Promise.all([worker(), worker(), worker()]);

  snap.fileKeys = wanted.map(([b, p]) => local.fileKey(b, p));
  await local.put("snapshots", snap);
  snapCache = null;
  await pruneFiles();
}

/** Stop keeping a boat on this device and free the space. */
export async function removeBoatOffline(boatId: string) {
  const s = offlineSettings();
  delete s[boatId];
  setOfflineSettings(s);
  await local.remove("snapshots", boatId);
  snapCache = null;
  await pruneFiles();
}

/** Delete saved files that no boat on this device uses any more. */
async function pruneFiles() {
  const used = new Set((await snapshots()).flatMap(s => s.fileKeys));
  for (const key of await local.allKeys(FILES)) {
    if (used.has(key)) continue;
    await local.remove(FILES, key);
    const url = fileUrls.get(key);
    if (url) { URL.revokeObjectURL(url); fileUrls.delete(key); }
  }
}

let refreshing: Promise<void> | null = null;
/** Bring every boat kept on this device up to date (when there's a connection). */
export function refreshOfflineBoats(userId: string) {
  if (!navigator.onLine) return Promise.resolve();
  refreshing ??= (async () => {
    try {
      for (const [boatId, options] of Object.entries(offlineSettings())) {
        try {
          await saveBoatOffline(boatId, userId, options);
        } catch (err) {
          console.warn("Couldn't refresh the offline copy; will try again next time.", err);
        }
      }
    } finally { refreshing = null; }
  })();
  return refreshing;
}

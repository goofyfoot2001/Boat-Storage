// Everything the screens need to read and change data goes through here.
// Row Level Security in Supabase makes sure each user only ever reaches their own rows and photos.
import { supabase } from "./supabase";
import type { Boat, Container, Deck, Item, ItemDocument, Location } from "./types";

const PHOTOS = "photos";

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
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

export async function signOut() {
  await supabase.auth.signOut();
}

// ── Photos ──────────────────────────────────────────────────────────────────

const urlCache = new Map<string, { url: string; expires: number }>();

/** Photos are private, so each one is shown through a short-lived signed link. */
export async function photoUrl(path: string) {
  const hit = urlCache.get(path);
  if (hit && hit.expires > Date.now()) return hit.url;
  const signedUrl = check(await supabase.storage.from(PHOTOS).createSignedUrl(path, 3600))!.signedUrl;
  urlCache.set(path, { url: signedUrl, expires: Date.now() + 50 * 60_000 });
  return signedUrl;
}

async function uploadPhoto(userId: string, blob: Blob) {
  const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  check(await supabase.storage.from(PHOTOS).upload(path, blob, { contentType: blob.type || "image/jpeg" }));
  return path;
}

async function removePhotos(paths: (string | null)[]) {
  const real = paths.filter((p): p is string => !!p);
  if (real.length) await supabase.storage.from(PHOTOS).remove(real);
  real.forEach(p => urlCache.delete(p));
}

const DOCUMENTS = "documents";

async function removeDocs(paths: string[]) {
  if (paths.length) await supabase.storage.from(DOCUMENTS).remove(paths);
}

/** Storage paths of every document attached to these items. */
async function docPathsForItems(itemIds: string[]) {
  if (!itemIds.length) return [];
  const rows = check(await supabase.from("item_documents").select("path").in("item_id", itemIds)) as { path: string }[];
  return rows.map(r => r.path);
}

/** photo: a new Blob replaces the old one, null removes it, undefined leaves it alone. */
async function replacePhoto(userId: string, oldPath: string | null, photo: Blob | null | undefined) {
  if (photo === undefined) return oldPath;
  const next = photo ? await uploadPhoto(userId, photo) : null;
  await removePhotos([oldPath]);
  return next;
}

// ── Boats ───────────────────────────────────────────────────────────────────

interface BoatRow { id: string; user_id: string; name: string; photo_path: string | null; sort_order: number }
const toBoat = (r: BoatRow): Boat => ({ id: r.id, userId: r.user_id, name: r.name, photoPath: r.photo_path, sortOrder: r.sort_order });

export async function listBoats() {
  const rows = check(await supabase.from("boats").select("*").order("sort_order").order("created_at"));
  return (rows as BoatRow[]).map(toBoat);
}

/** Number of decks on each boat, keyed by boat id. */
export async function deckCounts() {
  const rows = check(await supabase.from("decks").select("boat_id")) as { boat_id: string }[];
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.boat_id] = (counts[r.boat_id] ?? 0) + 1;
  return counts;
}

export async function getBoat(id: string) {
  const row = check(await supabase.from("boats").select("*").eq("id", id).maybeSingle());
  return row ? toBoat(row as BoatRow) : undefined;
}

export async function addBoat(userId: string, name: string, photo: Blob | null, sortOrder: number) {
  const photo_path = photo ? await uploadPhoto(userId, photo) : null;
  check(await supabase.from("boats").insert({ name: name.trim(), photo_path, sort_order: sortOrder }));
}

export async function updateBoat(boat: Boat, name: string, photo: Blob | null | undefined) {
  const photo_path = await replacePhoto(boat.userId, boat.photoPath, photo);
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
  const rows = check(await supabase.from("decks").select("*, locations(count)").eq("boat_id", boatId).order("sort_order").order("created_at"));
  return (rows as DeckRow[]).map(toDeck);
}

export async function getDeck(id: string) {
  const row = check(await supabase.from("decks").select("*").eq("id", id).maybeSingle());
  return row ? toDeck(row as DeckRow) : undefined;
}

export async function addDeck(userId: string, boatId: string, name: string, photo: Blob | null, sortOrder: number) {
  const photo_path = photo ? await uploadPhoto(userId, photo) : null;
  check(await supabase.from("decks").insert({ boat_id: boatId, name: name.trim(), photo_path, sort_order: sortOrder }));
}

export async function updateDeck(deck: Deck, name: string, photo: Blob | null | undefined) {
  const photo_path = await replacePhoto(deck.userId, deck.photoPath, photo);
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
async function filesOnDecks(deckIds: string[]) {
  if (!deckIds.length) return { photos: [], docs: [] };
  type Row = {
    photo_path: string | null;
    items: { photo_path: string | null; item_documents: { path: string }[] }[];
    containers: { photo_path: string | null }[];
  };
  const rows = check(await supabase.from("locations")
    .select("photo_path, items(photo_path, item_documents(path)), containers(photo_path)")
    .in("deck_id", deckIds)) as Row[];
  return {
    photos: rows.flatMap(r => [r.photo_path, ...r.items.map(i => i.photo_path), ...r.containers.map(c => c.photo_path)]),
    docs: rows.flatMap(r => r.items.flatMap(i => i.item_documents.map(d => d.path))),
  };
}

// ── Storage locations ───────────────────────────────────────────────────────

interface LocationRow {
  id: string; user_id: string; deck_id: string; name: string; x: number; y: number; color: string;
  photo_path: string | null; items?: { count: number }[];
}
const toLocation = (r: LocationRow): Location => ({
  id: r.id, userId: r.user_id, deckId: r.deck_id, name: r.name, x: r.x, y: r.y, color: r.color,
  photoPath: r.photo_path, itemCount: r.items?.[0]?.count ?? 0,
});

export async function listLocations(deckId: string) {
  const rows = check(await supabase.from("locations").select("*, items(count)").eq("deck_id", deckId).order("name"));
  return (rows as LocationRow[]).map(toLocation);
}

export async function getLocation(id: string) {
  const row = check(await supabase.from("locations").select("*").eq("id", id).maybeSingle());
  return row ? toLocation(row as LocationRow) : undefined;
}

export interface LocationFields { name: string; color: string }

export async function addLocation(userId: string, deckId: string, x: number, y: number, f: LocationFields, photo: Blob | null) {
  const photo_path = photo ? await uploadPhoto(userId, photo) : null;
  const row = check(await supabase.from("locations")
    .insert({ deck_id: deckId, x, y, name: f.name.trim(), color: f.color, photo_path }).select().single());
  return toLocation(row as LocationRow);
}

export async function updateLocation(loc: Location, f: LocationFields, photo: Blob | null | undefined) {
  const photo_path = await replacePhoto(loc.userId, loc.photoPath, photo);
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
  id: string; user_id: string; location_id: string; parent_id: string | null; name: string;
  notes: string | null; color: string; photo_path: string | null;
}
const toContainer = (r: ContainerRow): Container => ({
  id: r.id, userId: r.user_id, locationId: r.location_id, parentId: r.parent_id, name: r.name,
  notes: r.notes ?? "", color: r.color, photoPath: r.photo_path,
});

export async function listContainers(locationId: string) {
  const rows = check(await supabase.from("containers").select("*").eq("location_id", locationId).order("name"));
  return (rows as ContainerRow[]).map(toContainer);
}

export interface ContainerFields { name: string; notes: string; color: string }

const containerColumns = (f: ContainerFields) => ({ name: f.name.trim(), notes: f.notes.trim() || null, color: f.color });

export async function addContainer(userId: string, locationId: string, parentId: string | null, f: ContainerFields, photo: Blob | null) {
  const photo_path = photo ? await uploadPhoto(userId, photo) : null;
  check(await supabase.from("containers").insert({ location_id: locationId, parent_id: parentId, ...containerColumns(f), photo_path }));
}

export async function updateContainer(c: Container, f: ContainerFields, photo: Blob | null | undefined) {
  const photo_path = await replacePhoto(c.userId, c.photoPath, photo);
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
  id: string; user_id: string; location_id: string; container_id: string | null; name: string; quantity: number;
  price: number | string | null; notes: string | null; photo_path: string | null;
  item_documents?: { id: string; name: string }[];
}
const toItem = (r: ItemRow): Item => ({
  id: r.id, userId: r.user_id, locationId: r.location_id, containerId: r.container_id ?? null, name: r.name,
  quantity: r.quantity, price: r.price === null ? null : Number(r.price), notes: r.notes ?? "", photoPath: r.photo_path,
  docs: r.item_documents ?? [],
});

/** Item columns plus the names of attached documents (for the 📎 count and search). */
const ITEM_SELECT = "*, item_documents(id, name)";

export async function listItems(locationId: string) {
  const rows = check(await supabase.from("items").select(ITEM_SELECT).eq("location_id", locationId).order("name"));
  return (rows as ItemRow[]).map(toItem);
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
export async function addItem(userId: string, locationId: string, containerId: string | null, f: ItemFields, photo: Blob | null) {
  const photo_path = photo ? await uploadPhoto(userId, photo) : null;
  const row = check(await supabase.from("items")
    .insert({ location_id: locationId, container_id: containerId, ...itemColumns(f), photo_path }).select("id").single());
  return (row as { id: string }).id;
}

export async function updateItem(item: Item, f: ItemFields, photo: Blob | null | undefined) {
  const photo_path = await replacePhoto(item.userId, item.photoPath, photo);
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

interface DocumentRow { id: string; item_id: string; name: string; path: string; size: number; mime_type: string | null }
const toDocument = (r: DocumentRow): ItemDocument => ({
  id: r.id, itemId: r.item_id, name: r.name, path: r.path, size: Number(r.size), mimeType: r.mime_type,
});

export async function listDocuments(itemId: string) {
  const rows = check(await supabase.from("item_documents").select("*").eq("item_id", itemId).order("name"));
  return (rows as DocumentRow[]).map(toDocument);
}

export async function attachDocument(userId: string, itemId: string, file: File) {
  if (file.size > MAX_DOCUMENT_BYTES) throw new Error(`“${file.name}” is bigger than 50 MB.`);
  const ext = /\.([a-z0-9]{1,8})$/i.exec(file.name)?.[1]?.toLowerCase();
  // Stored under a random name; the original file name is kept in the database for display.
  const path = `${userId}/${itemId}/${crypto.randomUUID()}${ext ? `.${ext}` : ""}`;
  check(await supabase.storage.from(DOCUMENTS).upload(path, file, { contentType: file.type || "application/octet-stream" }));
  const { error } = await supabase.from("item_documents").insert({
    item_id: itemId, name: file.name.slice(0, 255), path, size: file.size, mime_type: file.type || null,
  });
  if (error) {
    await removeDocs([path]); // don't leave an orphaned file behind
    throw new Error(error.message);
  }
}

export async function deleteDocument(doc: ItemDocument) {
  check(await supabase.from("item_documents").delete().eq("id", doc.id));
  await removeDocs([doc.path]);
}

/** Types a browser can show by itself; everything else is downloaded / handed to the phone's viewer. */
const VIEWABLE = /^(application\/pdf|image\/|text\/plain)/;

/** A short-lived private link to open or download the document. */
export async function documentUrl(doc: ItemDocument) {
  const viewInBrowser = !!doc.mimeType && VIEWABLE.test(doc.mimeType);
  const res = await supabase.storage.from(DOCUMENTS)
    .createSignedUrl(doc.path, 600, viewInBrowser ? undefined : { download: doc.name });
  return check(res)!.signedUrl;
}

// Everything the screens need to read and change data goes through here.
// Row Level Security in Supabase makes sure each user only ever reaches their own rows and photos.
import { supabase } from "./supabase";
import type { Boat, Deck } from "./types";

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
    options: { emailRedirectTo: window.location.origin },
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
  const itemPhotos = await itemPhotoPaths(decks.map(d => d.id));
  check(await supabase.from("boats").delete().eq("id", boat.id));
  await removePhotos([boat.photoPath, ...decks.map(d => d.photo_path), ...itemPhotos]);
}

export async function reorderBoats(boats: Boat[]) {
  await Promise.all(boats.map((b, i) => supabase.from("boats").update({ sort_order: i }).eq("id", b.id)));
}

// ── Decks ───────────────────────────────────────────────────────────────────

interface DeckRow { id: string; user_id: string; boat_id: string; name: string; photo_path: string | null; sort_order: number }
const toDeck = (r: DeckRow): Deck => ({
  id: r.id, userId: r.user_id, boatId: r.boat_id, name: r.name, photoPath: r.photo_path, sortOrder: r.sort_order,
});

export async function listDecks(boatId: string) {
  const rows = check(await supabase.from("decks").select("*").eq("boat_id", boatId).order("sort_order").order("created_at"));
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
  const itemPhotos = await itemPhotoPaths([deck.id]);
  check(await supabase.from("decks").delete().eq("id", deck.id));
  await removePhotos([deck.photoPath, ...itemPhotos]);
}

export async function reorderDecks(decks: Deck[]) {
  await Promise.all(decks.map((d, i) => supabase.from("decks").update({ sort_order: i }).eq("id", d.id)));
}

async function itemPhotoPaths(deckIds: string[]) {
  if (!deckIds.length) return [];
  const rows = check(await supabase.from("items").select("photo_path, locations!inner(deck_id)")
    .in("locations.deck_id", deckIds).not("photo_path", "is", null)) as { photo_path: string }[];
  return rows.map(r => r.photo_path);
}

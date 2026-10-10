// Everything the screens need to read and change data goes through here,
// so swapping in the online database later only touches this file.
import * as db from "./db";
import type { Boat, Deck, Photo, User } from "./types";

const SESSION_KEY = "bsm-session";

const newId = () => crypto.randomUUID();

function toHex(buf: ArrayBuffer) {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password: string, salt: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations: 210_000, hash: "SHA-256" },
    key,
    256,
  );
  return toHex(bits);
}

// ── Auth ────────────────────────────────────────────────────────────────────

export interface Session {
  userId: string;
  email: string;
}

export function currentSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function saveSession(s: Session | null) {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // Private browsing can block storage; the user just stays signed in for this tab.
  }
}

async function findUser(email: string) {
  const [user] = await db.getBy<User>("users", "email", email);
  return user;
}

export async function signUp(email: string, password: string): Promise<Session> {
  email = email.trim().toLowerCase();
  if (await findUser(email)) throw new Error("An account with that email already exists.");
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)).buffer);
  const user: User = { id: newId(), email, salt, hash: await hashPassword(password, salt), createdAt: Date.now() };
  await db.put("users", user);
  const session = { userId: user.id, email };
  saveSession(session);
  return session;
}

export async function signIn(email: string, password: string): Promise<Session> {
  email = email.trim().toLowerCase();
  const user = await findUser(email);
  if (!user || (await hashPassword(password, user.salt)) !== user.hash) {
    throw new Error("Email or password is incorrect.");
  }
  const session = { userId: user.id, email };
  saveSession(session);
  return session;
}

export function signOut() {
  saveSession(null);
}

// ── Photos ──────────────────────────────────────────────────────────────────

export async function getPhoto(id: string) {
  return (await db.get<Photo>("photos", id))?.blob;
}

async function savePhoto(blob: Blob) {
  const id = newId();
  await db.put<Photo>("photos", { id, blob });
  return id;
}

/** photo: a new Blob replaces the old one, null removes it, undefined leaves it alone. */
async function updatePhoto(oldId: string | null, photo: Blob | null | undefined) {
  if (photo === undefined) return oldId;
  if (oldId) await db.del("photos", oldId);
  return photo ? savePhoto(photo) : null;
}

// ── Boats ───────────────────────────────────────────────────────────────────

const bySortOrder = <T extends { sortOrder: number; createdAt: number }>(a: T, b: T) =>
  a.sortOrder - b.sortOrder || a.createdAt - b.createdAt;

export async function listBoats(userId: string) {
  return (await db.getBy<Boat>("boats", "userId", userId)).sort(bySortOrder);
}

export async function getBoat(userId: string, id: string) {
  const boat = await db.get<Boat>("boats", id);
  return boat?.userId === userId ? boat : undefined;
}

export async function addBoat(userId: string, name: string, photo: Blob | null) {
  const existing = await listBoats(userId);
  const boat: Boat = {
    id: newId(),
    userId,
    name: name.trim(),
    photoId: photo ? await savePhoto(photo) : null,
    sortOrder: existing.length,
    createdAt: Date.now(),
  };
  await db.put("boats", boat);
  return boat;
}

export async function updateBoat(boat: Boat, name: string, photo: Blob | null | undefined) {
  await db.put<Boat>("boats", { ...boat, name: name.trim(), photoId: await updatePhoto(boat.photoId, photo) });
}

export async function deleteBoat(boat: Boat) {
  for (const deck of await listDecks(boat.userId, boat.id)) await deleteDeck(deck);
  if (boat.photoId) await db.del("photos", boat.photoId);
  await db.del("boats", boat.id);
}

export async function reorderBoats(boats: Boat[]) {
  await Promise.all(boats.map((b, i) => db.put<Boat>("boats", { ...b, sortOrder: i })));
}

// ── Decks ───────────────────────────────────────────────────────────────────

export async function listDecks(userId: string, boatId: string) {
  return (await db.getBy<Deck>("decks", "boatId", boatId)).filter(d => d.userId === userId).sort(bySortOrder);
}

export async function getDeck(userId: string, id: string) {
  const deck = await db.get<Deck>("decks", id);
  return deck?.userId === userId ? deck : undefined;
}

export async function addDeck(userId: string, boatId: string, name: string, photo: Blob | null) {
  const existing = await listDecks(userId, boatId);
  const deck: Deck = {
    id: newId(),
    userId,
    boatId,
    name: name.trim(),
    photoId: photo ? await savePhoto(photo) : null,
    sortOrder: existing.length,
    createdAt: Date.now(),
  };
  await db.put("decks", deck);
  return deck;
}

export async function updateDeck(deck: Deck, name: string, photo: Blob | null | undefined) {
  await db.put<Deck>("decks", { ...deck, name: name.trim(), photoId: await updatePhoto(deck.photoId, photo) });
}

export async function deleteDeck(deck: Deck) {
  if (deck.photoId) await db.del("photos", deck.photoId);
  await db.del("decks", deck.id);
}

export async function reorderDecks(decks: Deck[]) {
  await Promise.all(decks.map((d, i) => db.put<Deck>("decks", { ...d, sortOrder: i })));
}

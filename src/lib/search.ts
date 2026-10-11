import type { BoatContents } from "../data/store";
import type { Container, Item } from "../data/types";
import { formatPrice } from "./format";
import { containerPath } from "./places";

export type Place = BoatContents["locations"][number];

export interface ItemHit { item: Item; place: Place; path: Container[]; score: number }
export interface PlaceHit { place: Place; itemCount: number; score: number }
export interface ContainerHit { container: Container; place: Place; path: Container[]; itemCount: number; score: number }

/** Lower-case and strip accents so "Café" matches "cafe". */
export const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Search words: split on spaces, ignore "$" and "," so "$1,000" finds 1000. */
export function terms(query: string) {
  return normalize(query).replace(/[$,]/g, "").split(/\s+/).filter(Boolean);
}

/** How well one word matches a piece of text: whole word > start of a word > anywhere. */
function wordScore(text: string, term: string): number {
  const i = text.indexOf(term);
  if (i < 0) return 0;
  const startsWord = i === 0 || !/[a-z0-9]/.test(text[i - 1]);
  const endsWord = !/[a-z0-9]/.test(text[i + term.length] ?? " ");
  return startsWord && endsWord ? 3 : startsWord ? 2 : 1;
}

/** Every word must match one of the weighted fields; returns the total score, or 0 if any word misses. */
function scoreAll(words: string[], fields: [string, number][]) {
  let score = 0;
  for (const w of words) {
    const best = Math.max(...fields.map(([text, weight]) => wordScore(text, w) * weight));
    if (!best) return 0;
    score += best;
  }
  return score;
}

/**
 * Every search word has to appear somewhere (name, description, price, quantity, the
 * containers it's in, location or deck). Matches in the thing's own name rank highest.
 */
export function searchBoat(data: BoatContents, query: string) {
  const words = terms(query);
  const empty = { items: [] as ItemHit[], places: [] as PlaceHit[], containers: [] as ContainerHit[] };
  if (!words.length) return empty;
  const places = new Map(data.locations.map(l => [l.id, l]));
  const pathText = (path: Container[]) => normalize(path.map(c => c.name).join(" "));

  const items: ItemHit[] = [];
  for (const item of data.items) {
    const place = places.get(item.locationId);
    if (!place) continue;
    const path = containerPath(item.containerId, data.containers);
    const score = scoreAll(words, [
      [normalize(item.name), 10],
      [pathText(path), 4],
      [normalize(place.name), 4],
      [normalize(place.deckName), 2],
      [normalize(item.notes), 3],
      [normalize(item.docs.map(d => d.name).join(" ")), 3],
      [item.price != null ? `${item.price} ${item.price.toFixed(2)} ${formatPrice(item.price).replace(/[$,]/g, "")}` : "", 2],
      [`qty ${item.quantity}`, 1],
    ]);
    if (score) items.push({ item, place, path, score });
  }

  // How many items are in each location / container (including containers inside it).
  const locCounts = new Map<string, number>();
  const conCounts = new Map<string, number>();
  for (const i of data.items) {
    locCounts.set(i.locationId, (locCounts.get(i.locationId) ?? 0) + 1);
    for (const c of containerPath(i.containerId, data.containers)) conCounts.set(c.id, (conCounts.get(c.id) ?? 0) + 1);
  }

  const containers: ContainerHit[] = [];
  for (const container of data.containers) {
    const place = places.get(container.locationId);
    if (!place) continue;
    const path = containerPath(container.parentId, data.containers);
    const score = scoreAll(words, [
      [normalize(container.name), 10],
      [normalize(container.notes), 3],
      [pathText(path), 3],
      [normalize(place.name), 3],
      [normalize(place.deckName), 1],
    ]);
    if (score) containers.push({ container, place, path, itemCount: conCounts.get(container.id) ?? 0, score });
  }

  const placeHits: PlaceHit[] = [];
  for (const place of data.locations) {
    const score = scoreAll(words, [[normalize(place.name), 2], [normalize(place.deckName), 1]]);
    if (score) placeHits.push({ place, itemCount: locCounts.get(place.id) ?? 0, score });
  }

  items.sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name));
  containers.sort((a, b) => b.score - a.score || a.container.name.localeCompare(b.container.name));
  placeHits.sort((a, b) => b.score - a.score || a.place.name.localeCompare(b.place.name));
  return { items, places: placeHits, containers };
}

import type { BoatContents } from "../data/store";
import type { Item } from "../data/types";
import { formatPrice } from "./format";

export type Place = BoatContents["locations"][number];

export interface ItemHit { item: Item; place: Place; score: number }
export interface PlaceHit { place: Place; itemCount: number; score: number }

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

/**
 * Every search word has to appear somewhere (name, description, price, quantity,
 * location or deck). Matches in the item's own name rank highest.
 */
export function searchBoat(data: BoatContents, query: string) {
  const words = terms(query);
  if (!words.length) return { items: [] as ItemHit[], places: [] as PlaceHit[] };
  const places = new Map(data.locations.map(l => [l.id, l]));

  const items: ItemHit[] = [];
  for (const item of data.items) {
    const place = places.get(item.locationId);
    if (!place) continue;
    const fields: [string, number][] = [
      [normalize(item.name), 10],
      [normalize(place.name), 4],
      [normalize(place.deckName), 2],
      [normalize(item.notes), 3],
      [item.price != null ? `${item.price} ${item.price.toFixed(2)} ${formatPrice(item.price).replace(/[$,]/g, "")}` : "", 2],
      [`qty ${item.quantity}`, 1],
    ];
    let score = 0;
    let all = true;
    for (const w of words) {
      const best = Math.max(...fields.map(([text, weight]) => wordScore(text, w) * weight));
      if (!best) { all = false; break; }
      score += best;
    }
    if (all) items.push({ item, place, score });
  }

  const counts = new Map<string, number>();
  data.items.forEach(i => counts.set(i.locationId, (counts.get(i.locationId) ?? 0) + 1));
  const placeHits: PlaceHit[] = [];
  for (const place of data.locations) {
    const text = `${normalize(place.name)} ${normalize(place.deckName)}`;
    const scores = words.map(w => wordScore(text, w));
    if (scores.every(Boolean)) placeHits.push({ place, itemCount: counts.get(place.id) ?? 0, score: scores.reduce((a, b) => a + b, 0) });
  }

  items.sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name));
  placeHits.sort((a, b) => b.score - a.score || a.place.name.localeCompare(b.place.name));
  return { items, places: placeHits };
}

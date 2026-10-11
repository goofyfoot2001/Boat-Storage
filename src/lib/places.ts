import type { BoatContents } from "../data/store";
import type { Container } from "../data/types";

/** One choice in a "Stored in" list: a location, or a container inside one. */
export interface Target {
  value: string;
  label: string;
  deckName: string;
  locationId: string;
  containerId: string | null;
}

export const targetValue = (locationId: string, containerId: string | null) =>
  containerId ? `c:${containerId}` : `l:${locationId}`;

const INDENT = "   ";

/**
 * Every location on the boat, each followed by its containers (indented to show what's inside what).
 * `exclude` hides containers, e.g. a container and everything in it when moving it.
 */
export function buildTargets(data: BoatContents, exclude: Set<string> = new Set()): Target[] {
  const out: Target[] = [];
  for (const loc of data.locations) {
    out.push({ value: targetValue(loc.id, null), label: loc.name, deckName: loc.deckName, locationId: loc.id, containerId: null });
    const inLoc = data.containers.filter(c => c.locationId === loc.id && !exclude.has(c.id));
    const add = (parentId: string | null, depth: number) => {
      for (const c of inLoc.filter(c => c.parentId === parentId)) {
        out.push({
          value: targetValue(loc.id, c.id), label: `${INDENT.repeat(depth)}└ ${c.name}`,
          deckName: loc.deckName, locationId: loc.id, containerId: c.id,
        });
        add(c.id, depth + 1);
      }
    };
    add(null, 1);
  }
  return out;
}

/** Names from the outermost container down to `containerId`, e.g. ["Red tote", "Small box"]. */
export function containerPath(containerId: string | null, containers: Container[]): Container[] {
  const byId = new Map(containers.map(c => [c.id, c]));
  const path: Container[] = [];
  for (let c = containerId ? byId.get(containerId) : undefined; c; c = c.parentId ? byId.get(c.parentId) : undefined) {
    path.unshift(c);
    if (path.length > 50) break; // safety against a bad loop in the data
  }
  return path;
}

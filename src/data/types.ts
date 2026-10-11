export interface Boat {
  id: string;
  userId: string;
  name: string;
  photoPath: string | null;
  sortOrder: number;
}

/** A storage spot, shown as a colored dot on a deck layout. x/y are 0–1 across the picture. */
export interface Location {
  id: string;
  userId: string;
  boatId: string;
  deckId: string;
  name: string;
  x: number;
  y: number;
  color: string;
  photoPath: string | null;
  itemCount: number;
}

/** A bin, tote or box in a location. Containers can sit inside other containers. */
export interface Container {
  id: string;
  userId: string;
  boatId: string;
  locationId: string;
  /** The container this one sits in, or null if it sits directly in the location. */
  parentId: string | null;
  name: string;
  notes: string;
  color: string;
  photoPath: string | null;
}

/** Something stored at a location, loose or inside a container. */
export interface Item {
  id: string;
  userId: string;
  boatId: string;
  locationId: string;
  containerId: string | null;
  name: string;
  quantity: number;
  price: number | null;
  notes: string;
  photoPath: string | null;
  /** Attached documents (just enough for the 📎 count and search). */
  docs: { id: string; name: string }[];
}

/** A manual, spreadsheet, receipt… attached to an item. */
export interface ItemDocument {
  id: string;
  itemId: string;
  /** Original file name, e.g. "Owner's Manual.pdf". */
  name: string;
  path: string;
  size: number;
  mimeType: string | null;
}

export interface Deck {
  id: string;
  userId: string;
  boatId: string;
  name: string;
  photoPath: string | null;
  sortOrder: number;
  locationCount: number;
}

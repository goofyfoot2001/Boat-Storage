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
  deckId: string;
  name: string;
  x: number;
  y: number;
  color: string;
  photoPath: string | null;
  itemCount: number;
}

/** Something stored at a location. */
export interface Item {
  id: string;
  userId: string;
  locationId: string;
  name: string;
  quantity: number;
  price: number | null;
  notes: string;
  photoPath: string | null;
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

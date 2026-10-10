export interface Boat {
  id: string;
  userId: string;
  name: string;
  photoPath: string | null;
  sortOrder: number;
}

export interface Deck {
  id: string;
  userId: string;
  boatId: string;
  name: string;
  photoPath: string | null;
  sortOrder: number;
}

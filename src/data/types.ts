export interface User {
  id: string;
  email: string;
  salt: string;
  hash: string;
  createdAt: number;
}

export interface Boat {
  id: string;
  userId: string;
  name: string;
  photoId: string | null;
  sortOrder: number;
  createdAt: number;
}

export interface Deck {
  id: string;
  userId: string;
  boatId: string;
  name: string;
  photoId: string | null;
  sortOrder: number;
  createdAt: number;
}

export interface Photo {
  id: string;
  blob: Blob;
}

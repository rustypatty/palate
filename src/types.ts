export type Rating = 'loved' | 'liked' | 'wouldnt';

export type WineStyle =
  | 'red'
  | 'white'
  | 'rose'
  | 'sparkling'
  | 'orange'
  | 'dessert'
  | 'fortified';

/**
 * A bottle photo either lives on-device (uploaded or downloaded and resized),
 * or, when the source host blocks downloads, as a remote URL we display directly.
 */
export type Photo =
  | { kind: 'local'; blobId: string; source?: PhotoSource }
  | { kind: 'remote'; url: string; source?: PhotoSource };

export interface PhotoSource {
  /** Where the photo came from, e.g. "Open Food Facts" or a site's hostname. */
  name: string;
  /** Page the user can visit to double-check the photo. */
  pageUrl?: string;
  /** Title of the product as the source described it. */
  title?: string;
}

export interface AboutWine {
  text: string;
  sourceName: string;
  sourceUrl: string;
}

export interface Wine {
  id: string;
  producer: string;
  /** Cuvée / wine name, e.g. "Monte Bello" or "Brut Réserve". */
  name: string;
  /** A year, 'NV' for non-vintage, or null when unknown. */
  vintage: number | 'NV' | null;
  country: string;
  region: string;
  grapes: string[];
  style: WineStyle | null;
  /** Price paid per bottle, in the app's currency. */
  price: number | null;
  store: string;
  rating: Rating | null;
  /** Bottles currently on hand. */
  owned: number;
  notes: string;
  /** ISO date (yyyy-mm-dd) last tasted. */
  tastedOn: string | null;
  barcode: string;
  photo: Photo | null;
  /** Published tasting notes (winery/shop), summarised — kept apart from the user's own notes. */
  about?: AboutWine | null;
  createdAt: number;
  updatedAt: number;
}

export type WineDraft = Omit<Wine, 'id' | 'createdAt' | 'updatedAt'>;

export interface StoredPhoto {
  id: string;
  blob: Blob;
  width: number;
  height: number;
  /** True once the photo is stored online. */
  uploaded?: boolean;
}

export interface Deletion {
  id: string;
  deletedAt: number;
}

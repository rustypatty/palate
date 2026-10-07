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

export type WineList = 'want' | 'passed';

export interface StoreOffer {
  /** A store id from lib/stores, e.g. "totalwine". */
  storeId: string;
  url: string;
  price: number | null;
}

export interface LikeBottle {
  key: string;
  producer: string;
  wine: string;
  vintage: string;
  region: string;
  country: string;
  grapes: string[];
  style: WineStyle;
  /** Where it's sold, cheapest first. Every URL turned up in a search of that store's site. */
  offers: StoreOffer[];
  /** A product photo of the same producer and cuvée from another shop, or null. */
  image: { url: string; pageUrl: string; siteName: string } | null;
  /** True once the photo was checked to be a real bottle shot (image null: none found). */
  photoChecked?: boolean;
  reason: string;
}

export interface LikeThisCache {
  at: number;
  bottles: LikeBottle[];
  tips: string[];
  /** What the search covered, so the page can say what happened. */
  checked?: { pages: number; suggested: number; byStore: Record<string, number> };
}

export interface Suggestion {
  reason: string;
  /** Store or source it was suggested from, e.g. "Pogo's". */
  source: string;
  url?: string;
  /** The store listing it came from, so "Not for me" hides exactly that listing. */
  key?: string;
  at: number;
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
  /** Palate's written description of this wine for you, kept so reopening the page is free. */
  take?: WineTake | null;
  /**
   * Not part of the collection: a wine saved to try later ('want') or a suggestion
   * dismissed as "Not for me" ('passed'). Stored as wines so they sync like the rest.
   */
  list?: WineList | null;
  /** Why and where this wine was suggested, kept after it joins the collection. */
  suggestion?: Suggestion | null;
  /** Bottles like this one found at your stores, saved so reopening the page is free. */
  likeThis?: LikeThisCache | null;
  createdAt: number;
  updatedAt: number;
}

/** What a wine is, how it tastes, how it fits your taste and how to serve it — written by Claude from what it knows. */
export interface WineTake {
  whatItIs: string;
  taste: string;
  fit: string;
  serve: string;
  caveat: string;
  writtenAt: number;
  /** Your rating when it was written: a different rating since means "For you" may be out of date. */
  rating: Rating | null;
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

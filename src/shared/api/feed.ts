import type { TagRef } from "./tags";
import type { MediaRef } from "./versions";

// Teaser-Listen der Website: Startseite und Tag-Seiten, öffentlich unter /api/posts.

export const FEED_PAGE_SIZE = 10;

export type Teaser = {
  slug: string;
  title: string;
  firstPublishedAt: string;
  tags: TagRef[];
  /** Erstes nicht leeres Text-Element als reiner Text, gekürzt. */
  excerpt: string | null;
  /** Erstes Bild-Element. */
  image: MediaRef | null;
};

export type FeedPage = {
  teasers: Teaser[];
  /** Für die nächste Seite als ?after=… mitschicken; null, wenn es keine weiteren gibt. */
  nextCursor: string | null;
};

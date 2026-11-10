// Venue research through Apify's Google Maps scraper (actor compass/crawler-google-places): what kind of place a dinner
// is booked at, how expensive it is, and whether it is really a bar. There is no official API for this, so it is the one
// place Covers scrapes. It only reads. Covers uses the result as facts for the venue checks, never as a decision.
//   POST https://api.apify.com/v2/acts/compass~crawler-google-places/run-sync-get-dataset-items
//   Auth: `Authorization: Bearer $APIFY_TOKEN`. Billed per place scraped (pay per event) to the token's Apify account.
// Quirks: a search returns zero or more places; we ask for one (`maxCrawledPlacesPerSearch: 1`) and treat zero as
// "not found". `price` is Google's "$".."$$$$" (sometimes a range like "$30–50"), absent for many places.
import { z } from 'zod';

export const APIFY_BASE_URL = 'https://api.apify.com/v2';
export const GOOGLE_MAPS_ACTOR = 'compass~crawler-google-places';
const DEFAULT_TIMEOUT_MS = 120_000;

export class VenueError extends Error {
  constructor(public readonly kind: 'not_configured' | 'network' | 'timeout' | 'bad_response', message: string) {
    super(message);
    this.name = 'VenueError';
  }
}

/** One Google Maps place, only the fields Covers reads. */
const Place = z.looseObject({
  title: z.string(),
  categoryName: z.string().nullish(),
  categories: z.array(z.string()).nullish(),
  price: z.string().nullish(),
  totalScore: z.number().nullish(),
  reviewsCount: z.number().nullish(),
  address: z.string().nullish(),
  website: z.string().nullish(),
  url: z.string().nullish(),
  permanentlyClosed: z.boolean().nullish(),
  temporarilyClosed: z.boolean().nullish(),
});
type Place = z.infer<typeof Place>;

export const VenueFacts = z.object({
  query: z.string(),
  found: z.boolean(),
  name: z.string().nullable(),
  address: z.string().nullable(),
  category: z.string().nullable(),
  categories: z.array(z.string()),
  /** 1–4 from Google's "$".."$$$$", or null when Google shows no price. */
  priceLevel: z.number().int().min(1).max(4).nullable(),
  isRestaurant: z.boolean(),
  /** A bar, pub, lounge, nightclub or wine bar as its main category: the HHS-OIG alert's "not conducive" venues. */
  isBarFirst: z.boolean(),
  rating: z.number().nullable(),
  reviews: z.number().int().nullable(),
  closed: z.boolean(),
  source: z.string().nullable().describe('The Google Maps link, so anyone can check'),
});
export type VenueFacts = z.infer<typeof VenueFacts>;

const BAR = /\b(bar|pub|lounge|night ?club|tavern|saloon|brewery|wine bar|cocktail)\b/i;
const RESTAURANT = /\b(restaurant|bistro|steak ?house|trattoria|brasserie|grill|eatery|diner|cafe|café)\b/i;

/** "$$" -> 2; "$30–50" -> null (a range is not a level). */
export function priceLevelOf(price: string | null | undefined): number | null {
  if (!price) return null;
  const t = price.trim();
  return /^\${1,4}$/.test(t) ? t.length : null;
}

export function venueFactsFrom(query: string, place: Place | undefined): VenueFacts {
  if (!place) return { query, found: false, name: null, address: null, category: null, categories: [], priceLevel: null, isRestaurant: false, isBarFirst: false, rating: null, reviews: null, closed: false, source: null };
  const categories = place.categories ?? (place.categoryName ? [place.categoryName] : []);
  const main = place.categoryName ?? categories[0] ?? '';
  return VenueFacts.parse({
    query, found: true, name: place.title, address: place.address ?? null, category: main || null, categories,
    priceLevel: priceLevelOf(place.price),
    isRestaurant: categories.some((c) => RESTAURANT.test(c)) && !BAR.test(main),
    isBarFirst: BAR.test(main) && !RESTAURANT.test(main),
    rating: place.totalScore ?? null, reviews: place.reviewsCount ?? null,
    closed: !!(place.permanentlyClosed || place.temporarilyClosed), source: place.url ?? null,
  });
}

export type VenueClient = { lookup: (venue: string) => Promise<VenueFacts> };

export function createVenueClient(opts: { token?: string; fetchFn?: typeof fetch; baseUrl?: string; timeoutMs?: number } = {}): VenueClient {
  const token = opts.token ?? process.env.APIFY_TOKEN, fetchFn = opts.fetchFn ?? fetch, base = opts.baseUrl ?? APIFY_BASE_URL;
  return {
    async lookup(venue) {
      if (!token) throw new VenueError('not_configured', 'Venue research needs APIFY_TOKEN.');
      const input = { searchStringsArray: [venue], maxCrawledPlacesPerSearch: 1, language: 'en', maxReviews: 0, maxImages: 0, scrapePlaceDetailPage: false, skipClosedPlaces: false };
      let res: Response;
      try {
        res = await fetchFn(`${base}/acts/${GOOGLE_MAPS_ACTOR}/run-sync-get-dataset-items`, {
          method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify(input), signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
        });
      } catch (e) { throw new VenueError(e instanceof Error && e.name === 'TimeoutError' ? 'timeout' : 'network', `Apify unreachable: ${String(e)}`); }
      const body: unknown = await res.json().catch(() => null);
      const parsed = z.array(Place).safeParse(body);
      if (!res.ok || !parsed.success) throw new VenueError('bad_response', `Apify returned ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
      return venueFactsFrom(venue, parsed.data[0]);
    },
  };
}

// The two sample cards drawn in the /about hero.
//
// This is a fixed, hand-picked film set under a placeholder username, not
// anyone's real diary. Only the DATA is fixed: the pixels come from the real
// `renderCard`, the same renderer the extension and the web app use. The hero
// used to be an HTML/CSS imitation of a card, and it drifted from the product
// (wrong footer, wrong header, a CSS gradient instead of the real one). Feeding
// the real renderer means a renderer change shows up here on the next build.
//
// Posters are TMDB's, which serves them with `access-control-allow-origin: *`.
// They are fetched into data URLs before drawing (see hero.ts) because
// `renderCard` returns `canvas.toBlob()`, and a canvas that drew a plain
// cross-origin <img> is tainted and refuses to export.
import type { CardOptions } from '../canvas/renderCard'
import type { CardType } from '../types'
import { CARD_TYPE_CONFIGS } from '../types'

export const HERO_USERNAME = 'boxdcard'

const TMDB_POSTER_BASE = 'https://image.tmdb.org/t/p/w342'

export interface HeroFilm {
  title: string
  year: string
  /** Letterboxd-style star string. Empty for Favorites, which have no ratings on Letterboxd. */
  rating: string
  posterPath: string
}

export interface HeroCard {
  /** Which slot in the hero's card stack this card fills. */
  slot: 'front' | 'back'
  cardType: CardType
  films: HeroFilm[]
}

export const HERO_CARDS: HeroCard[] = [
  {
    slot: 'front',
    cardType: 'last-four-watched',
    films: [
      { title: 'In the Mood for Love', year: '2000', rating: '★★★★★', posterPath: '/iYypPT4bhqXfq1b6EnmxvRt6b2Y.jpg' },
      { title: 'Paddington 2',         year: '2017', rating: '★★★★½', posterPath: '/1OJ9vkD5xPt3skC6KguyXAgagRZ.jpg' },
      { title: 'Aftersun',             year: '2022', rating: '★★★★½', posterPath: '/evKz85EKouVbIr51zy5fOtpNRPg.jpg' },
      { title: 'Drive My Car',         year: '2021', rating: '★★★★',  posterPath: '/a2lxHS6Au35k5XtFQEQW44yWHeH.jpg' },
    ],
  },
  {
    slot: 'back',
    cardType: 'favorites',
    films: [
      { title: 'Stalker',           year: '1979', rating: '', posterPath: '/1qhOyf5C4s9ZdvY8d5JDx9DFMeT.jpg' },
      { title: 'Chungking Express', year: '1994', rating: '', posterPath: '/43I9DcNoCzpyzK8JCkJYpHqHqGG.jpg' },
      { title: 'Burning',           year: '2018', rating: '', posterPath: '/kXiF80o74fE9gf3Utf9moAI7ar0.jpg' },
      { title: 'Columbus',          year: '2017', rating: '', posterPath: '/3ZE5Wl3CdfUH4BkWRmyMKPHkWHx.jpg' },
    ],
  },
]

export function heroPosterUrl(film: HeroFilm): string {
  return `${TMDB_POSTER_BASE}${film.posterPath}`
}

/**
 * The options the web app would pass for this card on a landscape layout with
 * the default display toggles: titles, years and ratings on, type label on.
 * `posterDataUrls` is index-aligned with `card.films`; a missing entry draws
 * the renderer's own grey placeholder, exactly as a failed fetch does in the product.
 */
export function heroCardOptions(card: HeroCard, posterDataUrls: string[]): CardOptions {
  return {
    films: card.films.map((f, i) => ({
      title: f.title,
      year: f.year,
      rating: f.rating,
      posterDataUrl: posterDataUrls[i] ?? '',
    })),
    username: HERO_USERNAME,
    showTitle: true,
    showYear: true,
    showRating: card.cardType !== 'favorites',
    showDate: false,
    cardType: card.cardType,
    showCardTypeLabel: true,
    cardTypeLabel: CARD_TYPE_CONFIGS[card.cardType].label,
    showShareIcon: false,
    // TMDB posters are on the card, so credit TMDB the way the product does.
    usedTmdb: true,
    layout: 'landscape',
  }
}

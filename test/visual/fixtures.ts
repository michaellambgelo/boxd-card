// Sample data for the card studio and the golden-image suite.
//
// Deterministic and offline by construction: posters are the generated
// solid-colour fixtures, never real art, and nothing here reads the clock or
// the network. Text is chosen to exercise the layout rather than to look
// plausible — one deliberately long title, one two-line title, tags that wrap.
import { readFileSync } from 'node:fs'
import type { CardOptions, FilmEntry } from '../../src/canvas/renderCard'
import type { CardType, Layout, StatsCategory } from '../../src/types'
import type {
  StatEntry, ChartDataSet, BreakdownData, BarChartData, MilestonesData,
} from '../../src/content/index'

const POSTER_LETTERS = 'abcdefghijklmnopqrst'.split('')

const posterCache = new Map<string, string>()

export function poster(letter: string): string {
  const hit = posterCache.get(letter)
  if (hit) return hit
  const buf = readFileSync(`test/fixtures/posters/poster-${letter}.jpg`)
  const url = `data:image/jpeg;base64,${buf.toString('base64')}`
  posterCache.set(letter, url)
  return url
}

/** Titles picked to stress the text path, not to look realistic. */
const TITLES: [string, string, string][] = [
  ['Aftersun', '2022', '★★★★½'],
  ['Past Lives', '2023', '★★★★'],
  ['Everything Everywhere All at Once', '2022', '★★★★★'],
  ['Call Me by Your Name', '2017', '★★★★'],
  ['Portrait of a Lady on Fire', '2019', '★★★★½'],
  ['The Grand Budapest Hotel', '2014', '★★★★'],
  ['Moonlight', '2016', '★★★★★'],
  ['Lady Bird', '2017', '★★★★½'],
  ['Whiplash', '2014', '★★★★'],
  ['Parasite', '2019', '★★★★★'],
  ['Arrival', '2016', '★★★★'],
  ['Her', '2013', '★★★★½'],
  ['Dune', '2021', '★★★★'],
  ['Nope', '2022', '★★★½'],
  ['Tár', '2022', '★★★★'],
  ['Anatomy of a Fall', '2023', '★★★★½'],
  ['Poor Things', '2023', '★★★★'],
  ['The Zone of Interest', '2023', '★★★★½'],
  ['Perfect Days', '2023', '★★★★★'],
  ['Challengers', '2024', '★★★★'],
]

const DATES = [
  '12 Aug 2026', '09 Aug 2026', '03 Aug 2026', '28 Jul 2026', '21 Jul 2026',
  '19 Jul 2026', '14 Jul 2026', '08 Jul 2026', '02 Jul 2026', '27 Jun 2026',
  '22 Jun 2026', '18 Jun 2026', '11 Jun 2026', '05 Jun 2026', '31 May 2026',
  '26 May 2026', '20 May 2026', '15 May 2026', '09 May 2026', '01 May 2026',
]

export function films(n: number): FilmEntry[] {
  return Array.from({ length: n }, (_, i) => {
    const [title, year, rating] = TITLES[i % TITLES.length]
    return {
      title,
      year,
      rating,
      posterDataUrl: poster(POSTER_LETTERS[i % POSTER_LETTERS.length]),
      date: DATES[i % DATES.length],
    }
  })
}

/** A review card needs body text and tags on top of the film entry. */
export function reviewFilms(n: number): FilmEntry[] {
  const bodies = [
    'A film about the distance between who your parent was and who you were '
    + 'able to see at the time. The camcorder footage does something no amount '
    + 'of dialogue could.',
    'Two people keep almost having the life they might have had. It refuses the '
    + 'easy version of that story at every turn, which is why the ending lands '
    + 'as hard as it does.',
    'Structurally reckless in a way that keeps paying off. By the third act the '
    + 'maximalism has become the argument rather than the delivery mechanism.',
    'Sun-drunk and unhurried until it suddenly is not. The last shot holds long '
    + 'enough to become a different film.',
  ]
  return films(n).map((f, i) => ({
    ...f,
    reviewText: bodies[i % bodies.length],
    tags: i === 0 ? ['rewatch', 'summer', 'a24', 'favourites', 'letterboxd-season-challenge'] : ['rewatch'],
  }))
}

const STATS_SUMMARY: StatEntry[] = [
  { value: '312', label: 'Films' },
  { value: '148', label: 'Hours' },
  { value: '41', label: 'Directors' },
  { value: '3.8', label: 'Avg rating' },
  { value: '27', label: 'Rewatches' },
  { value: '19', label: 'Countries' },
]

const CHART_DATA: ChartDataSet = {
  weeklyFilms: Array.from({ length: 26 }, (_, i) => ({
    week: `2026-W${String(i + 1).padStart(2, '0')}`,
    label: `W${i + 1}`,
    // Deterministic pseudo-variation; no Math.random so fixtures never drift.
    count: [3, 5, 2, 7, 4, 1, 6, 8, 3, 2, 5, 4, 9, 6, 3, 1, 4, 7, 5, 2, 8, 3, 6, 4, 2, 5][i],
  })),
  dayOfWeek: [
    { day: 'Mon', count: 22 }, { day: 'Tue', count: 18 }, { day: 'Wed', count: 31 },
    { day: 'Thu', count: 27 }, { day: 'Fri', count: 44 }, { day: 'Sat', count: 61 },
    { day: 'Sun', count: 53 },
  ],
  summaryNumbers: STATS_SUMMARY.slice(0, 4),
}

const BREAKDOWN_DATA: BreakdownData = {
  pieRatios: { total: 312, rewatched: 27, releasedThisYear: 48, reviewed: 96 },
  ratingSpread: [2, 4, 9, 16, 28, 44, 61, 52, 38, 21],
  watchlist: { watched: 184, added: 512 },
  year: '2026',
}

function barChart(category: string, bars: [string, number][]): BarChartData {
  const max = Math.max(...bars.map(([, c]) => c))
  return {
    category,
    subCategory: 'most-watched',
    bars: bars.map(([label, count]) => ({
      label, count, percent: Math.round((count / max) * 100),
    })),
  }
}

const BAR_CHARTS: Record<string, BarChartData> = {
  genres: barChart('Genres', [
    ['Drama', 148], ['Comedy', 71], ['Thriller', 63], ['Romance', 45],
    ['Science Fiction', 38], ['Horror', 29], ['Documentary', 17], ['Animation', 12],
  ]),
  countries: barChart('Countries', [
    ['USA', 171], ['UK', 44], ['France', 31], ['Japan', 26],
    ['South Korea', 19], ['Germany', 14], ['Italy', 11], ['Sweden', 8],
  ]),
  languages: barChart('Languages', [
    ['English', 224], ['French', 28], ['Japanese', 21], ['Korean', 17],
    ['Spanish', 13], ['German', 9], ['Italian', 7], ['Mandarin', 5],
  ]),
}

function milestoneFilm(i: number, label: string, date: string) {
  const [title, year, rating] = TITLES[i % TITLES.length]
  return {
    title, year, rating,
    posterUrl: '', // studio feeds art via milestonePosterDataUrls, keyed by filmId
    filmId: `film:${1000 + i}`,
    label, date,
  }
}

const MILESTONES_DATA: MilestonesData = {
  firstFilm: milestoneFilm(0, 'First Film', 'Jan 3'),
  lastFilm: milestoneFilm(1, 'Last Film', 'Dec 28'),
  diaryMilestones: [
    milestoneFilm(2, '50th', 'Mar 18'),
    milestoneFilm(3, '100th', 'May 2'),
    milestoneFilm(4, '200th', 'Aug 9'),
    milestoneFilm(5, '300th', 'Nov 21'),
  ],
}

function milestonePosters(): Map<string, string> {
  const m = new Map<string, string>()
  const all = [
    MILESTONES_DATA.firstFilm, MILESTONES_DATA.lastFilm, ...MILESTONES_DATA.diaryMilestones,
  ].filter(Boolean)
  all.forEach((f, i) => {
    if (f) m.set(f.filmId, poster(POSTER_LETTERS[i % POSTER_LETTERS.length]))
  })
  return m
}

const BASE: Pick<CardOptions, 'username' | 'showTitle' | 'showYear' | 'showRating' | 'showDate'> = {
  username: 'michaellamb',
  showTitle: true,
  showYear: true,
  showRating: true,
  showDate: false,
}

/**
 * Build render options for one cell of the studio matrix.
 *
 * `listCount` is honoured for the card types that offer it, so the studio can
 * cover the <=4 vs >4 grid branch — the only ListCount boundary that changes a
 * layout decision.
 */
export function cardOptionsFor(
  cardType: CardType,
  layout: Layout,
  opts: { statsCategory?: StatsCategory; listCount?: 4 | 10 | 20 } = {},
): CardOptions {
  const { statsCategory, listCount = 4 } = opts

  switch (cardType) {
    case 'favorites':
      // Favorites never carry ratings — not in the DOM by design.
      return {
        ...BASE, layout, cardType,
        films: films(4).map((f) => ({ ...f, rating: '' })),
        showRating: false,
      }

    case 'recent-diary':
      return {
        ...BASE, layout, cardType, listCount,
        films: films(listCount),
        showDate: true,
      }

    case 'list':
      return {
        ...BASE, layout, cardType, listCount,
        films: films(listCount),
        showListTitle: true,
        showListDescription: true,
        listTitle: 'Films That Feel Like the End of Summer',
        listDescription:
          'The light goes long and gold and everyone is a little sad about it. '
          + 'Twenty entries, loosely ordered by how much they hurt.',
        showTags: true,
        listTags: ['summer', 'melancholy', 'coming-of-age', 'a24', 'rewatch-forever'],
      }

    case 'review':
      return {
        ...BASE, layout, cardType,
        films: reviewFilms(4),
        reviewCount: 2,
        showDate: true,
        showTags: true,
      }

    case 'stats':
      return statsOptions(layout, statsCategory ?? 'summary')

    case 'last-four-watched':
    default:
      return { ...BASE, layout, cardType, films: films(4) }
  }
}

function statsOptions(layout: Layout, statsCategory: StatsCategory): CardOptions {
  const base: CardOptions = {
    ...BASE,
    layout,
    cardType: 'stats',
    statsCategory,
    films: [],
    statsTitle: 'Year in Review',
    statsSubtitle: '2026 · michaellamb',
  }

  switch (statsCategory) {
    case 'summary':
      return { ...base, statsSummary: STATS_SUMMARY }
    case 'by-week':
      return { ...base, chartData: CHART_DATA }
    case 'breakdown':
      return { ...base, breakdownData: BREAKDOWN_DATA }
    case 'genres':
    case 'countries':
    case 'languages':
      return { ...base, barChartData: BAR_CHARTS[statsCategory] }
    case 'milestones':
      return {
        ...base,
        milestonesData: MILESTONES_DATA,
        milestonePosterDataUrls: milestonePosters(),
      }
    case 'most-watched':
    case 'highest-rated':
    default:
      // Poster-grid stats categories go through the normal grid path.
      return { ...base, films: films(4), listCount: 4 }
  }
}

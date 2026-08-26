import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { renderCard } from '../../src/canvas/renderCard'
import type { FilmEntry } from '../../src/canvas/renderCard'

const OUT = 'studio-out/foundation'

function posterDataUrl(name: string): string {
  const buf = readFileSync(`test/fixtures/posters/poster-${name}.jpg`)
  return `data:image/jpeg;base64,${buf.toString('base64')}`
}

const FILMS: FilmEntry[] = [
  { title: 'Aftersun', year: '2022', rating: '★★★★½', posterDataUrl: posterDataUrl('a') },
  { title: 'Past Lives', year: '2023', rating: '★★★★', posterDataUrl: posterDataUrl('b') },
  { title: 'Lady Bird', year: '2017', rating: '★★★★½', posterDataUrl: posterDataUrl('c') },
  { title: 'Call Me by Your Name', year: '2017', rating: '★★★★', posterDataUrl: posterDataUrl('d') },
]

async function blobBytes(b: Blob): Promise<Buffer> {
  return Buffer.from(await b.arrayBuffer())
}

describe('foundation: real rendering in the visual project', () => {
  it('renders a landscape 4-film card with real pixels', async () => {
    const blob = await renderCard({
      films: FILMS,
      username: 'michaellamb',
      showTitle: true,
      showYear: true,
      showRating: true,
      showDate: false,
      cardType: 'last-four-watched',
      layout: 'landscape',
      usedTmdb: true, // draws the TMDB logo too, so both ?url SVGs are exercised
    })

    expect(blob).toBeInstanceOf(Blob)
    const bytes = await blobBytes(blob)

    mkdirSync(OUT, { recursive: true })
    writeFileSync(`${OUT}/landscape-4film.png`, bytes)

    // A real PNG, not the mock's 8-byte 'mock-png'.
    expect(bytes.length).toBeGreaterThan(10_000)
    expect(bytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))

    // PNG IHDR carries width/height at bytes 16..24.
    const w = bytes.readUInt32BE(16)
    const h = bytes.readUInt32BE(20)
    writeFileSync(`${OUT}/dims.json`, JSON.stringify({ w, h, bytes: bytes.length }, null, 2))
    expect(w).toBe(1200)
  }, 30000)
})

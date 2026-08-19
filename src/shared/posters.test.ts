import { describe, it, expect } from 'vitest'
import { upscaleLetterboxdPoster } from './posters'

// Real URL shapes, taken from live Letterboxd markup (2026-08).
const POSTER = (size: string) =>
  `https://a.ltrbxd.com/resized/sm/upload/nx/8b/vs/gc/cDbNAY0KM84cxXhmj8f0dLWza3t-${size}-crop.jpg`

describe('upscaleLetterboxdPoster', () => {
  it('upgrades thumbnails to the target rendition', () => {
    // Page markup serves posters this small; cards draw them up to 280px wide,
    // which is the ~3x upscale that made custom posters illegible.
    for (const small of ['0-70-0-105', '0-125-0-187', '0-150-0-225', '0-230-0-345']) {
      expect(upscaleLetterboxdPoster(POSTER(small)), small).toBe(POSTER('0-460-0-690'))
    }
  })

  it('never downscales a poster that is already big enough', () => {
    for (const big of ['0-460-0-690', '0-600-0-900', '0-1000-0-1500']) {
      expect(upscaleLetterboxdPoster(POSTER(big)), big).toBe(POSTER(big))
    }
  })

  it('leaves avatars alone', () => {
    // Avatars are 1:1 and travel through the same image-fetch path. They have
    // their own 0-48 -> 0-80 rewrite at the scrape sites; widening them here
    // would fight it and distort the footer.
    const avatar = 'https://a.ltrbxd.com/resized/avatar/upload/a/b/c/avtr-0-80-0-80-crop.jpg'
    expect(upscaleLetterboxdPoster(avatar)).toBe(avatar)
    const small = 'https://a.ltrbxd.com/resized/avatar/upload/a/b/c/avtr-0-48-0-48-crop.jpg'
    expect(upscaleLetterboxdPoster(small)).toBe(small)
  })

  it('leaves backdrops alone', () => {
    // Backdrops use a different four-number form and a 16:9 aspect.
    const backdrop =
      'https://a.ltrbxd.com/resized/sm/upload/a6/8b/5j/zk/dune-2021a-1200-1200-675-675-crop-000000.jpg'
    expect(upscaleLetterboxdPoster(backdrop)).toBe(backdrop)
  })

  it('leaves non-Letterboxd and unresolved URLs alone', () => {
    const tmdb = 'https://image.tmdb.org/t/p/original/abc123.jpg'
    expect(upscaleLetterboxdPoster(tmdb)).toBe(tmdb)

    // /film/<slug>/image-NNN/ is an HTML endpoint resolved before fetching.
    const unresolved = 'https://letterboxd.com/film/dune-2021/image-150/'
    expect(upscaleLetterboxdPoster(unresolved)).toBe(unresolved)

    const dataUrl = 'data:image/png;base64,iVBORw0KGgo='
    expect(upscaleLetterboxdPoster(dataUrl)).toBe(dataUrl)
  })

  it('tolerates rounding in the 2:3 aspect', () => {
    // Letterboxd rounds some renditions; 300x449 is still a poster.
    expect(upscaleLetterboxdPoster(POSTER('0-300-0-449'))).toBe(POSTER('0-460-0-690'))
  })

  it('does not touch square or wide crops that happen to match the pattern', () => {
    for (const other of ['0-500-0-500', '0-400-0-225']) {
      expect(upscaleLetterboxdPoster(POSTER(other)), other).toBe(POSTER(other))
    }
  })

  it('handles empty and malformed input without throwing', () => {
    expect(upscaleLetterboxdPoster('')).toBe('')
    expect(upscaleLetterboxdPoster(undefined as unknown as string)).toBe(undefined)
    expect(upscaleLetterboxdPoster(POSTER('0-0-0-0'))).toBe(POSTER('0-0-0-0'))
  })

  it('rewrites only the size segment, preserving the rest of the URL', () => {
    const out = upscaleLetterboxdPoster(POSTER('0-70-0-105'))
    expect(out).toContain('/resized/sm/upload/nx/8b/vs/gc/')
    expect(out).toContain('cDbNAY0KM84cxXhmj8f0dLWza3t-')
    expect(out.endsWith('.jpg')).toBe(true)
  })
})

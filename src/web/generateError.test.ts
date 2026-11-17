import { describe, it, expect } from 'vitest'
import {
  GenerateError,
  failureReason,
  emptyFilmsError,
  emptyStatsError,
  allPostersFailedError,
} from './generateError'

describe('generate failure reasons', () => {
  it('tags an empty scrape as "empty" whatever stage it is thrown in', () => {
    expect(failureReason(emptyFilmsError('list'), 'fetch')).toBe('empty')
    expect(failureReason(emptyStatsError(), 'render')).toBe('empty')
  })

  it('tags all-posters-failed as "posters" and keeps the first rejection in the message', () => {
    const err = allPostersFailedError(new Error('HTTP 403 fetching image'))
    expect(failureReason(err, 'fetch')).toBe('posters')
    expect(err.message).toBe('All poster images failed to load. (Error: HTTP 403 fetching image)')
  })

  it('classes untagged errors by the stage they were thrown in', () => {
    expect(failureReason(new Error('HTTP 503 fetching page'), 'fetch')).toBe('fetch')
    expect(failureReason(new Error('canvas.toBlob returned null'), 'render')).toBe('render')
    expect(failureReason('a thrown string', 'render')).toBe('render')
  })

  it('words an empty favorites scrape differently from other empty pages', () => {
    expect(emptyFilmsError('favorites').message).toBe("No favorite films found on this profile.")
    expect(emptyFilmsError('list').message).toBe('No films found on this page. Check the URL and try again.')
  })

  it('is still an Error, so the catch block can read .message', () => {
    const err = emptyFilmsError('favorites')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(GenerateError)
  })
})

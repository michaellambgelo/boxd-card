import { describe, it, expect, beforeEach } from 'vitest'
import { captureHandoffUrl, getHandoffUrl, __resetHandoffForTests } from './handoff'

function setLocation(search: string, hash = ''): void {
  window.history.replaceState(null, '', `/app/${search}${hash}`)
}

describe('handoff', () => {
  beforeEach(() => {
    __resetHandoffForTests()
    setLocation('')
  })

  it('captures ?url= and strips it from the address bar', () => {
    setLocation('?url=https%3A%2F%2Fletterboxd.com%2Fsomeone%2F')
    captureHandoffUrl()
    expect(getHandoffUrl()).toBe('https://letterboxd.com/someone/')
    expect(window.location.search).toBe('')
  })

  it('accepts the short ?u= alias', () => {
    setLocation('?u=letterboxd.com/someone/')
    captureHandoffUrl()
    expect(getHandoffUrl()).toBe('letterboxd.com/someone/')
    expect(window.location.search).toBe('')
  })

  it('preserves the hash while stripping the query', () => {
    setLocation('?url=letterboxd.com/someone/', '#settings')
    captureHandoffUrl()
    expect(window.location.search).toBe('')
    expect(window.location.hash).toBe('#settings')
  })

  it('leaves the URL alone when there is no hand-off param', () => {
    setLocation('?utm_source=newsletter')
    captureHandoffUrl()
    expect(getHandoffUrl()).toBe('')
    expect(window.location.search).toBe('?utm_source=newsletter')
  })

  it('returns the same value on repeat reads', () => {
    // Must be a pure read, not read-and-clear: App seeds state with
    // useState(getHandoffUrl), and React StrictMode double-invokes state
    // initializers in development. A clearing read would leave the input blank
    // in dev only — exactly the kind of bug that never shows up in prod.
    setLocation('?url=letterboxd.com/someone/')
    captureHandoffUrl()
    expect(getHandoffUrl()).toBe('letterboxd.com/someone/')
    expect(getHandoffUrl()).toBe('letterboxd.com/someone/')
  })

  it('is idempotent — a second capture does not re-read the location', () => {
    setLocation('?url=letterboxd.com/someone/')
    captureHandoffUrl()
    setLocation('?url=letterboxd.com/other/')
    captureHandoffUrl()
    expect(getHandoffUrl()).toBe('letterboxd.com/someone/')
  })
})

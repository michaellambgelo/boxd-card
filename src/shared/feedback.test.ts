import { describe, it, expect, vi } from 'vitest'
import { FEEDBACK_ENDPOINT, FEEDBACK_LIMITS, scrubErrorMessage, submitFeedback, validateFeedback } from './feedback'

const diagnostics = { extVersion: '0.10.2', userAgent: 'Mozilla/5.0 Chrome/131' }

describe('scrubErrorMessage', () => {
  it('drops the username from the navigation hint', () => {
    expect(scrubErrorMessage('Navigate to letterboxd.com/someuser/diary/ first.'))
      .toBe('Navigate to letterboxd.com/… first.')
  })

  it('collapses full URLs to their host', () => {
    expect(scrubErrorMessage('Failed to fetch poster: https://a.ltrbxd.com/resized/film-poster/1/2/3.jpg 404'))
      .toBe('Failed to fetch poster: https://a.ltrbxd.com/… 404')
  })

  it('does not double-scrub a URL that already lost its path', () => {
    expect(scrubErrorMessage('see https://letterboxd.com/someuser/')).toBe('see https://letterboxd.com/…')
  })

  it('elides quoted identifiers', () => {
    expect(scrubErrorMessage('No poster for "dune-2021"')).toBe('No poster for "…"')
  })

  it('caps the length', () => {
    expect(scrubErrorMessage('x'.repeat(5000))).toHaveLength(FEEDBACK_LIMITS.errorMessage)
  })
})

describe('validateFeedback', () => {
  it('accepts general feedback and trims it', () => {
    expect(validateFeedback({ kind: 'feedback', message: '  love it  ' }))
      .toEqual({ ok: true, value: { kind: 'feedback', message: 'love it' } })
  })

  it('drops fields that are not in the schema', () => {
    const result = validateFeedback({
      kind: 'feedback',
      message: 'hi',
      pageUrl: 'https://letterboxd.com/someuser/',
      diagnostics: { ...diagnostics, username: 'someuser' },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(JSON.stringify(result.value)).not.toContain('someuser')
  })

  it('accepts an error report with no message when diagnostics carry the error', () => {
    const result = validateFeedback({ kind: 'error', message: '', diagnostics: { ...diagnostics, errorMessage: 'boom' } })
    expect(result.ok).toBe(true)
  })

  it('rejects empty general feedback', () => {
    expect(validateFeedback({ kind: 'feedback', message: '   ' })).toEqual({ ok: false, error: 'message is required' })
  })

  it('rejects an unknown kind', () => {
    expect(validateFeedback({ kind: 'spam', message: 'x' }).ok).toBe(false)
  })

  it('rejects non-objects', () => {
    expect(validateFeedback(null).ok).toBe(false)
    expect(validateFeedback([]).ok).toBe(false)
    expect(validateFeedback('x').ok).toBe(false)
  })

  it('rejects an over-long message', () => {
    expect(validateFeedback({ kind: 'feedback', message: 'x'.repeat(FEEDBACK_LIMITS.message + 1) }).ok).toBe(false)
  })

  it('validates the optional email', () => {
    expect(validateFeedback({ kind: 'feedback', message: 'x', email: 'a@b.co' }).ok).toBe(true)
    expect(validateFeedback({ kind: 'feedback', message: 'x', email: '' }).ok).toBe(true)
    expect(validateFeedback({ kind: 'feedback', message: 'x', email: 'not an email' }).ok).toBe(false)
    expect(validateFeedback({ kind: 'feedback', message: 'x', email: 42 }).ok).toBe(false)
    expect(validateFeedback({ kind: 'feedback', message: 'x', email: `${'a'.repeat(250)}@b.co` }).ok).toBe(false)
  })

  it('rejects mistyped diagnostics', () => {
    expect(validateFeedback({ kind: 'error', message: 'x', diagnostics: { ...diagnostics, listCount: '4' } }).ok).toBe(false)
    expect(validateFeedback({ kind: 'error', message: 'x', diagnostics: { ...diagnostics, tmdbEnabled: 'yes' } }).ok).toBe(false)
    expect(validateFeedback({ kind: 'error', message: 'x', diagnostics: 'nope' }).ok).toBe(false)
  })

  it('scrubs errorMessage even if the client did not', () => {
    const result = validateFeedback({
      kind: 'error',
      message: '',
      diagnostics: { ...diagnostics, errorMessage: 'Navigate to letterboxd.com/someuser/ first.' },
    })
    expect(result.ok && result.value.diagnostics?.errorMessage).toBe('Navigate to letterboxd.com/… first.')
  })
})

describe('submitFeedback', () => {
  it('POSTs the validated payload and returns the id', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'abc' }), { status: 201 }))
    const id = await submitFeedback({ kind: 'feedback', message: 'hi' }, fetchImpl)
    expect(id).toBe('abc')
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe(FEEDBACK_ENDPOINT)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ kind: 'feedback', message: 'hi' })
  })

  it('fails locally on an invalid payload without fetching', async () => {
    const fetchImpl = vi.fn()
    await expect(submitFeedback({ kind: 'feedback', message: '' }, fetchImpl)).rejects.toThrow('message is required')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('surfaces the server message on a 4xx', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('email is not a valid address', { status: 400 }))
    await expect(submitFeedback({ kind: 'feedback', message: 'x' }, fetchImpl)).rejects.toThrow('email is not a valid address')
  })

  it('explains a rate limit', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 429 }))
    await expect(submitFeedback({ kind: 'feedback', message: 'x' }, fetchImpl)).rejects.toThrow(/try again/)
  })

  it('explains a network failure', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(submitFeedback({ kind: 'feedback', message: 'x' }, fetchImpl)).rejects.toThrow(/Could not reach/)
  })
})

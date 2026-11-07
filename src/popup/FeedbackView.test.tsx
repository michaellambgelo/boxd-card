import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import FeedbackView from './FeedbackView'
import type { FeedbackPayload } from '../shared/feedback'

// No testing-library in this repo; react-dom + act under jsdom is enough for
// one view. Opt in to act() semantics so React flushes synchronously.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(chrome.runtime as unknown as { getManifest: () => { version: string } }).getManifest = () => ({ version: '9.9.9' })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function render(props: Partial<Parameters<typeof FeedbackView>[0]> = {}) {
  const submit = vi.fn<(p: FeedbackPayload) => Promise<string>>().mockResolvedValue('0123456789abcdef')
  act(() => {
    root.render(
      <FeedbackView
        initialKind="error"
        errorMessage="Navigate to letterboxd.com/someuser/diary/ first."
        context={{ cardType: 'recent-diary', layout: 'square', listCount: 10, tmdbEnabled: true }}
        onDone={() => {}}
        submit={submit}
        {...props}
      />,
    )
  })
  return { submit }
}

const preview = () => container.querySelector('pre')!.textContent!
const sendButton = () => [...container.querySelectorAll('button')].find(b => /Send/.test(b.textContent!))!

function type(selector: string, value: string) {
  const el = container.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  act(() => {
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('FeedbackView', () => {
  it('previews an error report with scrubbed diagnostics and no username', () => {
    render()
    const shown = JSON.parse(preview())
    expect(shown.kind).toBe('error')
    expect(shown.diagnostics).toMatchObject({
      extVersion: '9.9.9',
      cardType: 'recent-diary',
      layout: 'square',
      listCount: 10,
      tmdbEnabled: true,
      errorMessage: 'Navigate to letterboxd.com/… first.',
    })
    expect(container.textContent).not.toContain('someuser')
  })

  it('sends exactly what it previews', async () => {
    const { submit } = render()
    type('textarea', 'Clicked generate on my diary')
    type('input[type="email"]', 'fan@example.com')
    const previewed = JSON.parse(preview())
    await act(async () => { sendButton().click() })
    expect(submit).toHaveBeenCalledWith(previewed)
    expect(previewed).toMatchObject({ message: 'Clicked generate on my diary', email: 'fan@example.com' })
    expect(container.textContent).toContain('Thanks')
    expect(container.textContent).toContain('01234567')
  })

  it('leaves diagnostics off by default for general feedback', () => {
    render({ initialKind: 'feedback', errorMessage: undefined })
    expect(JSON.parse(preview())).not.toHaveProperty('diagnostics')
    expect(sendButton().disabled).toBe(true)
    type('textarea', 'More card types please')
    expect(sendButton().disabled).toBe(false)
  })

  it('shows the failure and stays editable', async () => {
    const submit = vi.fn().mockRejectedValue(new Error('Too many submissions — please try again in a minute.'))
    render({ submit })
    await act(async () => { sendButton().click() })
    expect(container.textContent).toContain('Too many submissions')
    expect(sendButton().disabled).toBe(false)
  })
})

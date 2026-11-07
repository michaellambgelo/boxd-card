import { useMemo, useState } from 'react'
import {
  FEEDBACK_LIMITS,
  FEEDBACK_RETENTION_DAYS,
  scrubErrorMessage,
  submitFeedback,
  type FeedbackDiagnostics,
  type FeedbackKind,
  type FeedbackPayload,
} from '../shared/feedback'
import styles from './Popup.module.css'

/**
 * The extension's only outbound channel that isn't a page or image fetch.
 *
 * The extension carries no telemetry, so when something breaks we learn about
 * it only if the user tells us. This view makes that one click from the error,
 * and shows the exact payload before anything leaves the browser — the
 * privacy policy promises both.
 */
export interface FeedbackViewProps {
  initialKind: FeedbackKind
  /** Raw error text; scrubbed here before it is shown or sent. */
  errorMessage?: string
  /** Card settings at the time — no page URL, by design. */
  context: Omit<FeedbackDiagnostics, 'extVersion' | 'userAgent' | 'errorMessage'>
  onDone: () => void
  /** Injected in tests. */
  submit?: (payload: FeedbackPayload) => Promise<string>
}

type SendState = { phase: 'editing' } | { phase: 'sending' } | { phase: 'sent'; id: string } | { phase: 'failed'; message: string }

export default function FeedbackView({ initialKind, errorMessage, context, onDone, submit = submitFeedback }: FeedbackViewProps) {
  const [kind, setKind] = useState<FeedbackKind>(initialKind)
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  // On by default for an error report (it IS the report), off for general
  // feedback, where it's rarely relevant.
  const [includeDiagnostics, setIncludeDiagnostics] = useState(initialKind === 'error')
  const [state, setState] = useState<SendState>({ phase: 'editing' })

  const diagnostics = useMemo<FeedbackDiagnostics>(() => ({
    extVersion: chrome.runtime.getManifest().version,
    userAgent: navigator.userAgent.slice(0, FEEDBACK_LIMITS.shortField),
    ...context,
    ...(kind === 'error' && errorMessage && { errorMessage: scrubErrorMessage(errorMessage) }),
  }), [context, errorMessage, kind])

  const payload: FeedbackPayload = {
    kind,
    message: message.trim(),
    ...(email.trim() && { email: email.trim() }),
    ...(includeDiagnostics && { diagnostics }),
  }

  const canSend = state.phase !== 'sending'
    && (payload.message !== '' || (kind === 'error' && includeDiagnostics && !!diagnostics.errorMessage))

  async function handleSend() {
    setState({ phase: 'sending' })
    try {
      const id = await submit(payload)
      setState({ phase: 'sent', id })
    } catch (err) {
      setState({ phase: 'failed', message: err instanceof Error ? err.message : String(err) })
    }
  }

  if (state.phase === 'sent') {
    return (
      <div className={styles.body}>
        <p className={styles.feedbackThanks}>Thanks — that's on its way.</p>
        {email.trim() && <p className={styles.settingsHint}>We'll reply to {email.trim()} if we have questions.</p>}
        {state.id && <p className={styles.settingsHint}>Reference: <code>{state.id.slice(0, 8)}</code></p>}
        <button className={styles.generateBtn} onClick={onDone}>Done</button>
      </div>
    )
  }

  return (
    <div className={styles.body}>
      <div className={styles.radioGroup} role="radiogroup" aria-label="Feedback type">
        <label className={styles.checkboxLabel}>
          <input type="radio" name="feedbackKind" checked={kind === 'error'} onChange={() => { setKind('error'); setIncludeDiagnostics(true) }} />
          Report a problem
        </label>
        <label className={styles.checkboxLabel}>
          <input type="radio" name="feedbackKind" checked={kind === 'feedback'} onChange={() => setKind('feedback')} />
          General feedback
        </label>
      </div>

      {kind === 'error' && errorMessage && (
        <p className={styles.error}>{scrubErrorMessage(errorMessage)}</p>
      )}

      <label className={styles.field}>
        <span className={styles.fieldLabel}>{kind === 'error' ? 'What were you doing? (optional)' : 'Your feedback'}</span>
        <textarea
          className={styles.altTextArea}
          rows={4}
          maxLength={FEEDBACK_LIMITS.message}
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder={kind === 'error' ? 'e.g. a 20-film list card on my diary page' : 'Ideas, bugs, card types you want…'}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>Email (optional, only if you want a reply)</span>
        <input
          className={styles.textInput}
          type="email"
          maxLength={FEEDBACK_LIMITS.email}
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </label>

      <label className={styles.checkboxLabel}>
        <input type="checkbox" checked={includeDiagnostics} onChange={e => setIncludeDiagnostics(e.target.checked)} />
        Include diagnostics
      </label>

      <details className={styles.feedbackPreview}>
        <summary>Exactly what will be sent</summary>
        <pre>{JSON.stringify(payload, null, 2)}</pre>
      </details>

      <p className={styles.settingsHint}>
        Never includes your Letterboxd URL or username unless you type it. Kept for {FEEDBACK_RETENTION_DAYS} days;
        see the <a href="https://boxd-card.com/privacy/" target="_blank" rel="noreferrer">privacy policy</a>.
      </p>

      <button className={styles.generateBtn} onClick={handleSend} disabled={!canSend}>
        {state.phase === 'sending' ? 'Sending…' : 'Send'}
      </button>

      {state.phase === 'failed' && <p className={styles.error}>{state.message}</p>}
    </div>
  )
}

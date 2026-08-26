// Exchange a Google service-account key for an OAuth access token.
//
//   node scripts/gcp-access-token.mjs <scope>
//   GCP_SERVICE_ACCOUNT_KEY=<the JSON key>   (env, never an argument)
//
// Prints the access token on stdout and nothing else, so a caller can capture
// it directly. Errors go to stderr.
//
// Why this exists rather than google-github-actions/auth:
//
// That action, given a service-account key and asked for an access token, does
// not use the key directly — it calls iamcredentials.generateAccessToken with
// the service account impersonating ITSELF. Which means the setup needs the IAM
// Service Account Credentials API enabled AND the account granted
// roles/iam.serviceAccountTokenCreator on itself. Both are pure overhead here,
// and both failed in turn before anything reached the Chrome Web Store.
//
// The JWT-bearer flow below is Google's documented server-to-server path for
// exactly this case: sign a short-lived assertion with the key you already have
// and trade it at the token endpoint. No extra APIs, no extra IAM, no network
// call that isn't the one we want.
//
// https://developers.google.com/identity/protocols/oauth2/service-account#httprest
import { createSign } from 'node:crypto'
import { pathToFileURL } from 'node:url'

const REQUIRED_FIELDS = ['client_email', 'private_key', 'token_uri']

const b64url = (input) => Buffer.from(input).toString('base64url')

/** Parse and shape-check a service-account key. Never echoes the value. */
export function parseServiceAccountKey(raw) {
  if (!raw) throw new Error('GCP_SERVICE_ACCOUNT_KEY is not set.')
  let key
  try {
    key = JSON.parse(raw)
  } catch {
    throw new Error('GCP_SERVICE_ACCOUNT_KEY is not valid JSON. Paste the whole key file, braces included.')
  }
  for (const field of REQUIRED_FIELDS) {
    if (!key[field]) throw new Error(`Service account key is missing "${field}".`)
  }
  return key
}

/** Build a signed JWT asserting "this service account, for this scope". */
export function buildAssertion(key, scope, now = Math.floor(Date.now() / 1000)) {
  const header = { alg: 'RS256', typ: 'JWT' }
  const claims = {
    iss: key.client_email,
    scope,
    aud: key.token_uri,
    iat: now,
    // One hour is the maximum Google accepts, and the token is discarded at the
    // end of the job either way.
    exp: now + 3600,
  }
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`
  const signature = createSign('RSA-SHA256').update(signingInput).sign(key.private_key)
  return `${signingInput}.${signature.toString('base64url')}`
}

/** Trade the signed assertion for an access token. */
export async function fetchAccessToken(key, scope, fetchImpl = fetch) {
  const response = await fetchImpl(key.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: buildAssertion(key, scope),
    }),
  })

  const body = await response.json().catch(() => ({}))

  if (!response.ok || !body.access_token) {
    // error/error_description are safe to surface; the token never is.
    const detail = body.error ? `${body.error}: ${body.error_description ?? ''}` : 'no access_token in response'
    const hint = response.status === 400 && body.error === 'invalid_grant'
      ? ' ("invalid_grant" usually means the key was revoked, or the runner clock has drifted.)'
      : ''
    throw new Error(`Token exchange failed (HTTP ${response.status}). ${detail}${hint}`)
  }

  return body.access_token
}

// Only run when invoked directly, so the helpers above stay importable by tests.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const scope = process.argv[2]
  if (!scope) {
    console.error('usage: node scripts/gcp-access-token.mjs <oauth-scope>')
    process.exit(2)
  }
  try {
    const key = parseServiceAccountKey(process.env.GCP_SERVICE_ACCOUNT_KEY)
    process.stdout.write(await fetchAccessToken(key, scope))
  } catch (err) {
    console.error(err.message)
    process.exit(1)
  }
}

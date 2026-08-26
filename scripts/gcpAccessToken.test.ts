import { describe, it, expect } from 'vitest'
import { createVerify, generateKeyPairSync } from 'node:crypto'
// @ts-expect-error — plain .mjs helper, no type declarations
import { buildAssertion, parseServiceAccountKey, fetchAccessToken } from './gcp-access-token.mjs'

// A throwaway keypair, generated per run. No real credential is involved, and
// nothing here talks to Google.
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })

const KEY = {
  client_email: 'boxd-card-publisher@example.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  token_uri: 'https://oauth2.googleapis.com/token',
}

const SCOPE = 'https://www.googleapis.com/auth/chromewebstore'

function decodeSegment(segment: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'))
}

describe('parseServiceAccountKey', () => {
  it('rejects a missing value', () => {
    expect(() => parseServiceAccountKey(undefined)).toThrow(/not set/)
  })

  it('rejects malformed JSON without echoing it', () => {
    // The message must never contain the input — it is a credential.
    try {
      parseServiceAccountKey('{"private_key": "-----BEGIN PRIVATE KEY-----super-secret')
      throw new Error('should have thrown')
    } catch (err) {
      const msg = (err as Error).message
      expect(msg).toMatch(/not valid JSON/)
      expect(msg).not.toMatch(/super-secret/)
    }
  })

  it.each(['client_email', 'private_key', 'token_uri'])('requires %s', (field) => {
    const partial = { ...KEY } as Record<string, string>
    delete partial[field]
    expect(() => parseServiceAccountKey(JSON.stringify(partial))).toThrow(new RegExp(field))
  })

  it('accepts a well-formed key', () => {
    expect(parseServiceAccountKey(JSON.stringify(KEY)).client_email).toBe(KEY.client_email)
  })
})

describe('buildAssertion', () => {
  it('produces a three-part JWT whose signature verifies', () => {
    const jwt = buildAssertion(KEY, SCOPE, 1_700_000_000)
    const parts = jwt.split('.')
    expect(parts).toHaveLength(3)

    // The whole point of this module is that the signature is right; assert it
    // rather than assuming the crypto call did what we meant.
    const verifier = createVerify('RSA-SHA256')
    verifier.update(`${parts[0]}.${parts[1]}`)
    expect(verifier.verify(publicKey, Buffer.from(parts[2], 'base64url'))).toBe(true)
  })

  it('sets the claims Google requires for the JWT-bearer grant', () => {
    const now = 1_700_000_000
    // slice(0, 2): the third segment is the signature, not JSON.
    const [header, claims] = buildAssertion(KEY, SCOPE, now).split('.').slice(0, 2).map(decodeSegment)

    expect(header).toEqual({ alg: 'RS256', typ: 'JWT' })
    expect(claims.iss).toBe(KEY.client_email)
    expect(claims.scope).toBe(SCOPE)
    // aud must be the token endpoint, not the API being called.
    expect(claims.aud).toBe(KEY.token_uri)
    expect(claims.iat).toBe(now)
    // One hour is Google's maximum; longer is rejected outright.
    expect((claims.exp as number) - (claims.iat as number)).toBe(3600)
  })
})

describe('fetchAccessToken', () => {
  it('sends a jwt-bearer grant and returns the token', async () => {
    let seen: { url: string; body: URLSearchParams } | null = null
    const fakeFetch = async (url: string, init: { body: URLSearchParams }) => {
      seen = { url, body: init.body }
      return { ok: true, status: 200, json: async () => ({ access_token: 'ya29.test-token' }) }
    }

    const token = await fetchAccessToken(KEY, SCOPE, fakeFetch)
    expect(token).toBe('ya29.test-token')
    expect(seen!.url).toBe(KEY.token_uri)
    expect(seen!.body.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer')
    expect(seen!.body.get('assertion')!.split('.')).toHaveLength(3)
  })

  it('fails loudly when the exchange is rejected', async () => {
    const fakeFetch = async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid_grant', error_description: 'Invalid JWT Signature.' }),
    })
    await expect(fetchAccessToken(KEY, SCOPE, fakeFetch)).rejects.toThrow(/invalid_grant/)
  })

  it('does not treat a 200 without a token as success', async () => {
    // The store API has taught us this lesson already: a 200 is not a result.
    const fakeFetch = async () => ({ ok: true, status: 200, json: async () => ({}) })
    await expect(fetchAccessToken(KEY, SCOPE, fakeFetch)).rejects.toThrow(/no access_token/)
  })
})

#!/usr/bin/env node
/**
 * Triage extension feedback stored in the FEEDBACK KV namespace.
 *
 * Wrangler-only by design: the worker has no read route, so reading feedback
 * needs Cloudflare credentials on this machine (`npx wrangler whoami`).
 *
 *   npm run feedback -- list [--status new] [--kind error] [--json]
 *   npm run feedback -- show <key | id | id-prefix>
 *   npm run feedback -- status <key | id | id-prefix> <new|triaged|issue|wontfix|done> [--note "text"]
 *
 * `status` rewrites the record AND its key metadata, and passes the original
 * expiry back to `kv key put`. Without `--expiration` a put on an existing key
 * silently replaces its TTL with "never expire", which would break the
 * 180-day promise in the privacy policy.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const WORKER_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'worker')
const STATUSES = ['new', 'triaged', 'issue', 'wontfix', 'done']

/** Run wrangler from worker/ so it binds to this worker's config, never another. */
function wrangler(args) {
  return execFileSync('npx', ['wrangler', ...args], {
    cwd: WORKER_DIR,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false', FORCE_COLOR: '0' },
    maxBuffer: 32 * 1024 * 1024,
  })
}

function listKeys() {
  const out = wrangler(['kv', 'key', 'list', '--binding', 'FEEDBACK', '--remote', '--prefix', 'fb:'])
  // Wrangler may print a banner before the JSON array.
  return JSON.parse(out.slice(out.indexOf('[')))
}

function getRecord(key) {
  return JSON.parse(wrangler(['kv', 'key', 'get', key, '--binding', 'FEEDBACK', '--remote', '--text']))
}

/** Accept a full key, a full uuid, or an unambiguous uuid prefix (the "Reference" users see). */
function resolveKey(ref) {
  if (ref.startsWith('fb:')) return ref
  const matches = listKeys().filter(k => k.name.split(':').at(-1).startsWith(ref))
  if (matches.length === 1) return matches[0].name
  throw new Error(matches.length === 0 ? `No feedback matches "${ref}"` : `"${ref}" is ambiguous (${matches.length} matches)`)
}

function flag(args, name) {
  const i = args.indexOf(name)
  return i === -1 ? undefined : args[i + 1]
}

function cmdList(args) {
  const status = flag(args, '--status')
  const kind = flag(args, '--kind')
  const keys = listKeys().filter(k =>
    (!status || k.metadata?.status === status) && (!kind || k.metadata?.kind === kind))
  if (args.includes('--json')) {
    console.log(JSON.stringify(keys, null, 2))
    return
  }
  if (keys.length === 0) {
    console.log('No feedback.')
    return
  }
  for (const k of keys) {
    const m = k.metadata ?? {}
    const id = k.name.split(':').at(-1)
    console.log(`${(m.receivedAt ?? '').slice(0, 16).replace('T', ' ')}  ${id.slice(0, 8)}  ${(m.kind ?? '?').padEnd(8)} ${(m.status ?? '?').padEnd(8)} ${m.preview ?? ''}`)
  }
  console.log(`\n${keys.length} item(s). Full key for a row: npm run feedback -- show <8-char id>`)
}

function cmdShow(args) {
  const key = resolveKey(args[0] ?? '')
  console.log(JSON.stringify({ key, ...getRecord(key) }, null, 2))
}

function cmdStatus(args) {
  const [ref, status] = args
  if (!STATUSES.includes(status)) throw new Error(`status must be one of: ${STATUSES.join(', ')}`)
  const key = resolveKey(ref ?? '')
  const record = getRecord(key)
  const note = flag(args, '--note')
  record.status = status
  if (note) {
    record.notes = `${record.notes ? `${record.notes}\n` : ''}[${new Date().toISOString()}] ${note}`
  }
  const metadata = {
    kind: record.kind,
    status,
    receivedAt: record.receivedAt,
    preview: (record.message || record.diagnostics?.errorMessage || '').replace(/\s+/g, ' ').trim().slice(0, 80),
  }
  const putArgs = ['kv', 'key', 'put', key, '--binding', 'FEEDBACK', '--remote', '--metadata', JSON.stringify(metadata)]
  if (typeof record.expiresAt === 'number') putArgs.push('--expiration', String(record.expiresAt))
  else console.warn('warning: record has no expiresAt; it will no longer expire')

  // Value via a temp file: user-written text never goes through argv.
  const dir = mkdtempSync(join(tmpdir(), 'boxd-feedback-'))
  try {
    const file = join(dir, 'value.json')
    writeFileSync(file, JSON.stringify(record))
    wrangler([...putArgs, '--path', file])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  console.log(`${key} → ${status}${note ? ' (note added)' : ''}`)
}

const [command, ...rest] = process.argv.slice(2)
const commands = { list: cmdList, show: cmdShow, status: cmdStatus }
try {
  if (!commands[command]) {
    console.error('usage: npm run feedback -- list [--status S] [--kind K] [--json] | show <ref> | status <ref> <status> [--note "text"]')
    process.exit(2)
  }
  commands[command](rest)
} catch (err) {
  console.error(err.stderr?.toString() || err.message)
  process.exit(1)
}

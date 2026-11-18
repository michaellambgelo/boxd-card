/**
 * "Remember my Letterboxd username" for the web app.
 *
 * The extension learns who you are from your logged-in Letterboxd tab. The web
 * app has no such session — the proxy fetches pages anonymously — so it takes
 * the member's word for it: they type a username once, we confirm the profile
 * exists, and keep the username plus a copy of the avatar in this browser's
 * localStorage (via the RememberedUser helpers in storage/settings.ts).
 *
 * Nothing here calls track() or logs, and no thrown message quotes the
 * username: these errors are shown in Settings, but anything that reaches a
 * console or Faro must stay content-free (see "Telemetry and privacy" in
 * CLAUDE.md).
 */
import type { RememberedUser } from '../storage/settings'
import { fetchImageDataUrl, fetchPageDocument, scrapePageOwnerAvatarUrl, scrapeUsername } from './webScraper'

/** How old the saved avatar may get before it is quietly re-fetched. */
export const MEMBER_STALE_MS = 7 * 24 * 60 * 60 * 1000

/** Entries in the header avatar's menu. Each is a page with a fixed URL. */
export const MEMBER_PAGES = [
  { id: 'profile', label: 'Profile', path: '' },
  { id: 'diary',   label: 'Diary',   path: 'diary/' },
  { id: 'reviews', label: 'Reviews', path: 'reviews/' },
] as const

export type MemberPageId = typeof MEMBER_PAGES[number]['id']

/**
 * Accepts what people actually type: `name`, `@name`, `letterboxd.com/name/`,
 * or a full profile URL (deeper paths are fine — only the first segment is
 * read). Returns null for anything that can't be a username.
 */
export function normalizeUsernameInput(raw: string): string | null {
  let s = raw.trim()
  if (!s) return null
  const urlish = s.match(/^(?:https?:\/\/)?(?:www\.)?letterboxd\.com\/([^/?#]*)/i)
  if (urlish) s = urlish[1]
  s = s.replace(/^@/, '')
  return /^[A-Za-z0-9_-]{1,40}$/.test(s) ? s : null
}

export function memberPageUrl(username: string, page: MemberPageId): string {
  const path = MEMBER_PAGES.find(p => p.id === page)?.path ?? ''
  return `https://letterboxd.com/${username}/${path}`
}

/** Letterboxd usernames are case-insensitive; `/User123/` and `/user123/` are one member. */
export function isSameMember(a: string | undefined, b: string | undefined): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase()
}

export function isMemberStale(user: RememberedUser, now: number = Date.now()): boolean {
  return now - user.at > MEMBER_STALE_MS
}

/**
 * True only for an avatar the member uploaded to Letterboxd.
 *
 * A profile with no picture still has an <img>: Letterboxd's stock silhouette
 * on `s.ltrbxd.com/static/img/avatar…png`, or a Gravatar URL whose fallback is
 * that same silhouette. Neither is "their avatar" — and Gravatar is not on the
 * proxy allowlist anyway — so both mean "show the gradient icon instead".
 */
export function isUploadedAvatarUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.hostname === 'a.ltrbxd.com' && u.pathname.includes('/avatar/')
  } catch {
    return false
  }
}

export class MemberLookupError extends Error {}

/**
 * The weekly refresh. Never throws and never loses the member: a failed lookup
 * (Letterboxd down, firewall, even a 404) keeps what is saved and only
 * re-stamps `at`, so the next attempt is a week out rather than every load.
 */
export async function refreshMember(saved: RememberedUser, now: number = Date.now()): Promise<RememberedUser> {
  try {
    return await lookupMember(saved.username, now, saved)
  } catch {
    return { ...saved, at: now }
  }
}

/**
 * Confirms the profile exists and fetches its avatar. Throws MemberLookupError
 * with a message fit to show the user; never includes the username.
 */
export async function lookupMember(
  username: string,
  now: number = Date.now(),
  /** The copy already saved for this member, if any — see the catch below. */
  previous?: RememberedUser,
): Promise<RememberedUser> {
  let doc: Document
  try {
    doc = await fetchPageDocument(`https://letterboxd.com/${username}/`)
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    if (/HTTP 404/.test(message)) {
      throw new MemberLookupError("Letterboxd doesn't have a member with that username.")
    }
    if (/firewall/i.test(message)) {
      throw new MemberLookupError("Letterboxd's firewall blocked the lookup. Try again in a minute.")
    }
    throw new MemberLookupError('Could not reach Letterboxd to check that username. Try again.')
  }

  // `/films/`, `/lists/` and friends are real pages that are not profiles —
  // some even carry another member's data-owner. Only an exact owner match is
  // this member's profile. Store Letterboxd's own casing.
  const owner = scrapeUsername(doc)
  if (!isSameMember(owner, username)) {
    throw new MemberLookupError("Letterboxd doesn't have a member with that username.")
  }

  const user: RememberedUser = { username: owner, at: now }
  const avatarUrl = scrapePageOwnerAvatarUrl(doc)
  if (avatarUrl && isUploadedAvatarUrl(avatarUrl)) {
    try {
      user.avatarDataUrl = await fetchImageDataUrl(avatarUrl)
    } catch {
      // The member is real and still has a picture; only fetching it failed.
      // Keep the copy we already hold rather than swapping a good avatar for
      // the gradient icon over one proxy hiccup. A first-time save has no
      // previous copy and goes without until the next refresh.
      if (previous?.avatarDataUrl && isSameMember(previous.username, owner)) {
        user.avatarDataUrl = previous.avatarDataUrl
      }
    }
  }
  return user
}

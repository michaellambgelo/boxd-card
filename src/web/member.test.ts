import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./webScraper', async importOriginal => {
  const actual = await importOriginal<typeof import('./webScraper')>()
  return { ...actual, fetchPageDocument: vi.fn(), fetchImageDataUrl: vi.fn() }
})

import { fetchImageDataUrl, fetchPageDocument } from './webScraper'
import {
  MEMBER_STALE_MS, MemberLookupError,
  isMemberStale, isSameMember, isUploadedAvatarUrl, lookupMember, memberPageUrl, normalizeUsernameInput, refreshMember,
} from './member'

const mockPage = vi.mocked(fetchPageDocument)
const mockImage = vi.mocked(fetchImageDataUrl)

function profileDoc(owner: string, avatarSrc?: string): Document {
  const img = avatarSrc ? `<div class="profile-avatar"><span class="avatar"><img src="${avatarSrc}" /></span></div>` : ''
  return new DOMParser().parseFromString(
    `<html><body data-owner="${owner}"><section class="profile-header">${img.replace('<img ', '<img class="avatar" ')}</section></body></html>`,
    'text/html',
  )
}

const UPLOADED = 'https://a.ltrbxd.com/resized/avatar/upload/1/2/3/shard/avtr-0-220-0-220-crop.jpg?v=abc'
const STOCK    = 'https://s.ltrbxd.com/static/img/avatar220-BlsAxsT2.png'
const GRAVATAR = 'https://secure.gravatar.com/avatar/5251d5ef?size=220&default=https%3A%2F%2Fs.ltrbxd.com%2Fstatic%2Fimg%2Favatar220-BlsAxsT2.png'

beforeEach(() => {
  mockPage.mockReset()
  mockImage.mockReset()
})

describe('normalizeUsernameInput', () => {
  it.each([
    ['michaellamb', 'michaellamb'],
    ['  michaellamb  ', 'michaellamb'],
    ['@michaellamb', 'michaellamb'],
    ['letterboxd.com/michaellamb/', 'michaellamb'],
    ['https://letterboxd.com/michaellamb/', 'michaellamb'],
    ['https://www.letterboxd.com/michaellamb/diary/', 'michaellamb'],
    ['https://letterboxd.com/User_123?x=1', 'User_123'],
  ])('%s → %s', (raw, expected) => {
    expect(normalizeUsernameInput(raw)).toBe(expected)
  })

  it.each(['', '   ', '@', 'two words', 'a/b', 'https://example.com/michaellamb/', 'letterboxd.com/', 'x'.repeat(41)])(
    'rejects %j', raw => {
      expect(normalizeUsernameInput(raw)).toBeNull()
    },
  )
})

describe('memberPageUrl', () => {
  it('builds the three fixed pages', () => {
    expect(memberPageUrl('ada', 'profile')).toBe('https://letterboxd.com/ada/')
    expect(memberPageUrl('ada', 'diary')).toBe('https://letterboxd.com/ada/diary/')
    expect(memberPageUrl('ada', 'reviews')).toBe('https://letterboxd.com/ada/reviews/')
  })
})

describe('isSameMember', () => {
  it('ignores case and rejects blanks', () => {
    expect(isSameMember('User123', 'user123')).toBe(true)
    expect(isSameMember('ada', 'bob')).toBe(false)
    expect(isSameMember('', '')).toBe(false)
    expect(isSameMember(undefined, 'ada')).toBe(false)
  })
})

describe('isMemberStale', () => {
  it('turns stale only after the window', () => {
    const at = 1_000_000
    expect(isMemberStale({ username: 'ada', at }, at + MEMBER_STALE_MS)).toBe(false)
    expect(isMemberStale({ username: 'ada', at }, at + MEMBER_STALE_MS + 1)).toBe(true)
  })
})

describe('isUploadedAvatarUrl', () => {
  it('accepts only an uploaded Letterboxd avatar', () => {
    expect(isUploadedAvatarUrl(UPLOADED)).toBe(true)
    expect(isUploadedAvatarUrl(STOCK)).toBe(false)
    expect(isUploadedAvatarUrl(GRAVATAR)).toBe(false)
    expect(isUploadedAvatarUrl('not a url')).toBe(false)
  })
})

describe('lookupMember', () => {
  it('stores Letterboxd\'s casing and the avatar image', async () => {
    mockPage.mockResolvedValue(profileDoc('User123', UPLOADED))
    mockImage.mockResolvedValue('data:image/jpeg;base64,AAAA')
    const user = await lookupMember('user123', 42)
    expect(user).toEqual({ username: 'User123', at: 42, avatarDataUrl: 'data:image/jpeg;base64,AAAA' })
    expect(mockPage).toHaveBeenCalledWith('https://letterboxd.com/user123/')
  })

  it.each([['stock silhouette', STOCK], ['gravatar', GRAVATAR]])(
    'remembers a member with a %s but no avatar image', async (_name, src) => {
      mockPage.mockResolvedValue(profileDoc('ada', src))
      const user = await lookupMember('ada', 1)
      expect(user).toEqual({ username: 'ada', at: 1 })
      expect(mockImage).not.toHaveBeenCalled()
    },
  )

  it('still remembers the member when only the avatar fetch fails', async () => {
    mockPage.mockResolvedValue(profileDoc('ada', UPLOADED))
    mockImage.mockRejectedValue(new Error('HTTP 502 fetching image'))
    expect(await lookupMember('ada', 1)).toEqual({ username: 'ada', at: 1 })
  })

  it('keeps the previously saved avatar when a refresh cannot fetch the image', async () => {
    mockPage.mockResolvedValue(profileDoc('ada', UPLOADED))
    mockImage.mockRejectedValue(new Error('HTTP 502 fetching image'))
    const previous = { username: 'ada', at: 1, avatarDataUrl: 'data:image/jpeg;base64,OLD' }
    expect(await lookupMember('ada', 2, previous)).toEqual({ username: 'ada', at: 2, avatarDataUrl: 'data:image/jpeg;base64,OLD' })
  })

  it('drops the saved avatar once the member has removed their picture', async () => {
    mockPage.mockResolvedValue(profileDoc('ada', STOCK))
    const previous = { username: 'ada', at: 1, avatarDataUrl: 'data:image/jpeg;base64,OLD' }
    expect(await lookupMember('ada', 2, previous)).toEqual({ username: 'ada', at: 2 })
  })

  it('rejects a page owned by someone else (e.g. /films/)', async () => {
    mockPage.mockResolvedValue(profileDoc('itscharlibb', UPLOADED))
    await expect(lookupMember('films')).rejects.toBeInstanceOf(MemberLookupError)
  })

  it.each([
    ['HTTP 404 fetching page', /doesn't have a member/],
    ["Letterboxd's firewall is blocking this request.", /firewall/],
    ['Failed to fetch', /Could not reach Letterboxd/],
  ])('maps "%s" to a message that never quotes the username', async (cause, expected) => {
    mockPage.mockRejectedValue(new Error(cause))
    const err = await lookupMember('secretname').catch(e => e)
    expect(err).toBeInstanceOf(MemberLookupError)
    expect(err.message).toMatch(expected)
    expect(err.message).not.toContain('secretname')
  })
})

describe('refreshMember', () => {
  const saved = { username: 'ada', at: 1, avatarDataUrl: 'data:image/jpeg;base64,OLD' }

  it('replaces the avatar when the refresh succeeds', async () => {
    mockPage.mockResolvedValue(profileDoc('ada', UPLOADED))
    mockImage.mockResolvedValue('data:image/jpeg;base64,NEW')
    expect(await refreshMember(saved, 9)).toEqual({ username: 'ada', at: 9, avatarDataUrl: 'data:image/jpeg;base64,NEW' })
  })

  it.each(['HTTP 404 fetching page', 'Failed to fetch'])(
    'keeps everything and only re-stamps when the lookup fails (%s)', async cause => {
      mockPage.mockRejectedValue(new Error(cause))
      expect(await refreshMember(saved, 9)).toEqual({ ...saved, at: 9 })
    },
  )
})

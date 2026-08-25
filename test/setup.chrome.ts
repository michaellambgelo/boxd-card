import { vi } from 'vitest'

// Mock Chrome extension APIs before any module imports them
const mockMessageListeners: Array<(...args: unknown[]) => unknown> = []

globalThis.chrome = {
  runtime: {
    id: 'test-extension-id',
    onMessage:   { addListener: vi.fn((fn) => mockMessageListeners.push(fn)) },
    onInstalled: { addListener: vi.fn() },
    sendMessage: vi.fn(),
  },
  tabs: {
    query: vi.fn(),
    sendMessage: vi.fn(),
  },
  declarativeContent: {
    onPageChanged: {
      removeRules: vi.fn((_rules, cb) => cb?.()),
      addRules: vi.fn(),
    },
    PageStateMatcher: vi.fn(),
    ShowAction: vi.fn(),
  },
} as unknown as typeof chrome

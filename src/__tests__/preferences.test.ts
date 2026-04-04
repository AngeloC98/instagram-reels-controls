import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockStorage = {
  get: vi.fn().mockResolvedValue({}),
  set: vi.fn().mockResolvedValue(undefined),
}

vi.mock('../browser', () => ({
  ext: {
    runtime: { getURL: (path: string) => `chrome-extension://test/${path}` },
    storage: { local: mockStorage },
  },
}))

beforeEach(() => {
  vi.resetModules()
  mockStorage.get.mockResolvedValue({})
  mockStorage.set.mockReset()
})

describe('preferences', () => {
  it('loads preferences from storage', async () => {
    mockStorage.get.mockResolvedValue({ muted: false, volume: 0.5, speed: 1.5 })
    const prefs = await import('../preferences')
    await prefs.prefsReady
    expect(prefs.preferredMuted).toBe(false)
    expect(prefs.preferredVolume).toBe(0.5)
    expect(prefs.preferredSpeed).toBe(1.5)
  })

  it('uses defaults when storage is empty', async () => {
    mockStorage.get.mockResolvedValue({})
    const prefs = await import('../preferences')
    await prefs.prefsReady
    expect(prefs.preferredMuted).toBe(true)
    expect(prefs.preferredVolume).toBe(1)
    expect(prefs.preferredSpeed).toBe(1)
  })

  it('debounces saves', async () => {
    vi.useFakeTimers()
    const prefs = await import('../preferences')
    await prefs.prefsReady

    prefs.savePrefs()
    prefs.savePrefs()
    prefs.savePrefs()

    vi.advanceTimersByTime(300)

    expect(mockStorage.set).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})

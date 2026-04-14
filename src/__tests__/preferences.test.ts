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
    mockStorage.get.mockResolvedValue({
      muted: false,
      volume: 0.5,
      speed: 1.5,
      autoplayNext: true,
    })
    const prefs = await import('../preferences')
    await prefs.preferenceStore.ready
    expect(prefs.preferenceStore.getSnapshot()).toMatchObject({
      muted: false,
      volume: 0.5,
      speed: 1.5,
      autoplayNext: true,
    })
  })

  it('uses defaults when storage is empty', async () => {
    mockStorage.get.mockResolvedValue({})
    const prefs = await import('../preferences')
    await prefs.preferenceStore.ready
    expect(prefs.preferenceStore.getSnapshot()).toMatchObject({
      muted: true,
      volume: 1,
      speed: 1,
      autoplayNext: false,
    })
  })

  it('debounces saves', async () => {
    vi.useFakeTimers()
    const prefs = await import('../preferences')
    await prefs.preferenceStore.ready

    prefs.preferenceStore.save()
    prefs.preferenceStore.save()
    prefs.preferenceStore.save()

    vi.advanceTimersByTime(300)

    expect(mockStorage.set).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})

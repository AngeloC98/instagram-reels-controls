import { describe, it, expect, vi } from 'vitest'
import { formatTime } from '../sync'

vi.mock('../browser', () => ({
  ext: {
    runtime: { getURL: (path: string) => `chrome-extension://test/${path}` },
    storage: { local: { get: vi.fn().mockResolvedValue({}), set: vi.fn() } },
  },
}))

describe('formatTime', () => {
  it('formats 0 seconds', () => {
    expect(formatTime(0)).toBe('0:00')
  })

  it('formats 35 seconds', () => {
    expect(formatTime(35)).toBe('0:35')
  })

  it('formats 125 seconds', () => {
    expect(formatTime(125)).toBe('2:05')
  })

  it('formats 61 seconds', () => {
    expect(formatTime(61)).toBe('1:01')
  })

  it('returns 0:00 for NaN', () => {
    expect(formatTime(NaN)).toBe('0:00')
  })

  it('floors 59.9 seconds', () => {
    expect(formatTime(59.9)).toBe('0:59')
  })
})

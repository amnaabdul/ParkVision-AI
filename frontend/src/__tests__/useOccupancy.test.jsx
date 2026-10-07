// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import useOccupancy from '../hooks/useOccupancy'
vi.mock('../api/client', () => ({ api: { get: vi.fn() } }))
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-05T12:00:00Z'))
  api.get.mockReset()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})
const snapshot = {
  spots: { a: 'free' },
  confidence: { a: 0.84 },
  timestamp: '2026-10-05T12:00:00Z',
}
describe('shared occupancy polling', () => {
  it('preserves the real snapshot on failure and marks offline', async () => {
    api.get
      .mockResolvedValueOnce({ data: snapshot })
      .mockRejectedValue(new Error('Offline'))
    const { result } = renderHook(() => useOccupancy())
    await act(async () => {})
    expect(result.current.state).toBe('Live')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(result.current.state).toBe('Offline')
    expect(result.current.observation).toEqual(snapshot)
  })
  it('pauses requests, ages the detector timestamp and resumes', async () => {
    api.get.mockResolvedValue({ data: snapshot })
    const { result } = renderHook(() => useOccupancy())
    await act(async () => {})
    act(() => result.current.stop())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(16000)
    })
    expect(api.get).toHaveBeenCalledTimes(1)
    expect(result.current.polling).toBe(false)
    expect(result.current.state).toBe('Stale')
    act(() => result.current.start())
    await act(async () => {})
    expect(api.get).toHaveBeenCalledTimes(2)
  })
  it('ignores an in-flight response after Stop', async () => {
    let resolve
    api.get.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done
        })
    )
    const { result } = renderHook(() => useOccupancy())
    act(() => result.current.stop())
    await act(async () => {
      resolve({ data: snapshot })
    })
    expect(result.current.observation).toBeNull()
  })
})

describe('UTC detector freshness during active polling', () => {
  it('ages the detector time while repeated successful polls keep connection active', async () => {
    const timestamp = '2026-10-05T18:24:20Z'
    vi.setSystemTime(new Date(timestamp))
    api.get.mockResolvedValue({ data: { ...snapshot, timestamp } })
    const { result } = renderHook(() => useOccupancy())
    await act(async () => {})
    expect(result.current.state).toBe('Live')
    await act(async () => { await vi.advanceTimersByTimeAsync(15000) })
    expect(result.current.state).toBe('Live')
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(result.current.connection).toBe('connected')
    expect(result.current.polling).toBe(true)
    expect(result.current.state).toBe('Stale')
    expect(result.current.observation.timestamp).toBe(timestamp)
    expect(Date.parse(result.current.lastChecked)).toBeGreaterThan(Date.parse(timestamp))
    api.get.mockResolvedValue({ data: { ...snapshot, timestamp: new Date().toISOString() } })
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(result.current.state).toBe('Live')
  })
})

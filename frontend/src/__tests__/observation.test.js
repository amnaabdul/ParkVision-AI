import { describe, expect, it, vi } from 'vitest'
import { freshness, normalizeObservation, parkingMetrics, parseTimestamp, observationAgeMs, formatTime, STALE_AFTER_MS } from '../observation'
describe('observation metadata and freshness', () => {
  const now = Date.parse('2026-10-05T12:00:00Z')
  it('retains confidence and detector time', () => {
    expect(
      normalizeObservation({
        spots: { a: 'free' },
        confidence: { a: 0.8 },
        timestamp: 't',
      })
    ).toEqual({ spots: { a: 'free' }, confidence: { a: 0.8 }, timestamp: 't' })
  })
  it('distinguishes live, stale, offline, missing and unknown freshness', () => {
    const data = { spots: { a: 'free' }, timestamp: '2026-10-05T12:00:00Z' }
    expect(freshness(data, 'connected', now)).toBe('Live')
    expect(freshness(data, 'connected', now + 16000)).toBe('Stale')
    expect(freshness(data, 'offline', now)).toBe('Offline')
    expect(freshness(normalizeObservation({}), 'connected', now)).toBe(
      'No data'
    )
    expect(freshness({ ...data, timestamp: null }, 'connected', now)).toBe(
      'Unknown freshness'
    )
    expect(
      freshness(
        { ...data, timestamp: '2026-10-06T12:00:00Z' },
        'connected',
        now
      )
    ).toBe('Unknown freshness')
  })
  it('does not interpret metadata as occupancy', () => {
    expect(
      normalizeObservation({ confidence: { a: 0.8 }, timestamp: 't' }).spots
    ).toEqual({})
  })
})
describe('layout-scoped metrics', () => {
  const layout = {
    spots: [{ spot_id: 'a' }, { spot_id: 'b' }, { spot_id: 'c' }],
  }
  const observation = normalizeObservation({
    spots: { a: 'occupied', b: 'free', old: 'occupied' },
  })
  it('ignores obsolete IDs and reports unknown coverage', () => {
    expect(parkingMetrics(layout, observation)).toEqual({
      free: 1,
      occupied: 1,
      total: 3,
      unknown: 1,
      rate: '33.3',
      hasData: true,
    })
  })
  it('never applies production status to sample geometry', () => {
    expect(
      parkingMetrics({ ...layout, isSample: true }, observation)
    ).toMatchObject({
      free: 0,
      occupied: 0,
      unknown: 3,
      rate: null,
      hasData: false,
    })
  })
  it('does not invent availability before observations exist', () => {
    expect(parkingMetrics(layout, null)).toMatchObject({
      unknown: 3,
      hasData: false,
      rate: null,
    })
  })
})

describe('UTC timestamps and local display', () => {
  const timestamp = '2026-10-05T18:24:20Z'
  const observation = { spots: { spot_1: 'free' }, timestamp }
  const instant = Date.parse(timestamp)
  it('is live immediately and remains live through the existing 15-second threshold', () => {
    expect(STALE_AFTER_MS).toBe(15000)
    expect(freshness(observation, 'connected', instant)).toBe('Live')
    expect(freshness(observation, 'connected', instant + 14999)).toBe('Live')
    expect(freshness(observation, 'connected', instant + 15000)).toBe('Live')
    expect(freshness(observation, 'connected', instant + 15001)).toBe('Stale')
    expect(observationAgeMs(observation, instant + 15001)).toBe(15001)
  })
  it('treats UTC and offset timestamps as the same instant', () => {
    expect(parseTimestamp(timestamp)).toBe(parseTimestamp('2026-10-05T21:24:20+03:00'))
    expect(freshness({ ...observation, timestamp: '2026-10-05T21:24:20+03:00' }, 'connected', instant + 1000)).toBe('Live')
  })
  it('uses browser local formatting without reparsing the formatted value', () => {
    const local = new Date(instant).toLocaleString()
    expect(formatTime(timestamp)).toBe(local)
    const formatter = vi.spyOn(Date.prototype, 'toLocaleString').mockReturnValue('05/10/2026, 21:24:20')
    try {
      expect(formatTime(timestamp)).toBe('05/10/2026, 21:24:20')
      expect(freshness(observation, 'connected', instant + 1000)).toBe('Live')
      expect(freshness(observation, 'connected', instant + 16000)).toBe('Stale')
    } finally { formatter.mockRestore() }
  })
  it('rejects localized and timezone-less timestamps instead of assuming browser timezone', () => {
    for (const value of ['05/10/2026, 21:24:20', '2026-10-05T18:24:20', null, 'bad']) {
      expect(freshness({ ...observation, timestamp: value }, 'connected', instant)).toBe('Unknown freshness')
    }
  })
})

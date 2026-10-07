import { countOccupancy, parseStatus } from './occupancy'
export const STALE_AFTER_MS = 15000
// Detector timestamps describe instants. Never interpret timezone-less input
// or a localized display string as a detector observation time.
export function parseTimestamp(value) {
  if (typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return NaN
  return Date.parse(value)
}
export function observationAgeMs(observation, now = Date.now()) {
  const timestamp = parseTimestamp(observation?.timestamp)
  return Number.isFinite(timestamp) ? now - timestamp : null
}
export function normalizeObservation(data) {
  const parsed = parseStatus(data)
  const spots = Object.fromEntries(
    Object.entries(parsed ?? {}).filter(
      ([, value]) => value === 'free' || value === 'occupied'
    )
  )
  return {
    spots,
    confidence: data?.confidence ?? {},
    timestamp: data?.timestamp ?? null,
  }
}
export function freshness(observation, connection, now = Date.now()) {
  if (connection === 'offline') return 'Offline'
  if (connection === 'checking') return 'Connecting'
  if (!observation || !Object.keys(observation.spots).length) return 'No data'
  const age = observationAgeMs(observation, now)
  if (age === null || age < -5000) return 'Unknown freshness'
  return age > STALE_AFTER_MS ? 'Stale' : 'Live'
}
export function parkingMetrics(layout, observation) {
  const counts = countOccupancy(
    layout?.spots ?? [],
    layout?.isSample ? null : observation?.spots
  )
  const known = counts.free + counts.occupied
  return {
    ...counts,
    unknown: counts.total - known,
    rate:
      counts.total && known
        ? ((counts.occupied / counts.total) * 100).toFixed(1)
        : null,
    hasData: known > 0,
  }
}
export function formatTime(value) {
  const time = parseTimestamp(value)
  return Number.isFinite(time)
    ? new Date(time).toLocaleString()
    : 'Not available'
}

import PropTypes from 'prop-types'
import { formatTime, parkingMetrics, STALE_AFTER_MS } from '../observation'
export function Connection({ feed }) {
  const tone =
    feed.state === 'Live'
      ? 'good'
      : feed.state === 'Offline'
        ? 'bad'
        : 'warning'
  return (
    <div className="connection" aria-live="polite">
      <span className={`badge ${tone}`}>
        <i />
        {feed.state === 'Live' ? 'Connected / Live' : feed.state}
      </span>
      <span>{feed.polling ? 'Auto refresh enabled' : 'Polling paused'}</span>
    </div>
  )
}
Connection.propTypes = { feed: PropTypes.object.isRequired }
export function DetectorInfo({ feed }) {
  return (
    <div className="detector-info">
      <div>
        <span>Last detector update</span>
        <strong>{formatTime(feed.observation?.timestamp)}</strong>
      </div>
      <div>
        <span>Backend connection</span>
        <strong>
          {feed.connection === 'connected'
            ? 'Connected'
            : feed.connection === 'offline'
              ? 'Offline'
              : 'Checking'}
        </strong>
      </div>
      <div>
        <span>Data freshness</span>
        <strong>{feed.state}</strong>
        {typeof feed.observationAgeMs === 'number' &&
          feed.observationAgeMs >= 0 && (
            <small>
              Detector observation is {Math.floor(feed.observationAgeMs / 1000)}
              s old (stale after {STALE_AFTER_MS / 1000}s).
            </small>
          )}
      </div>
    </div>
  )
}
DetectorInfo.propTypes = { feed: PropTypes.object.isRequired }
export default function ParkingSummary({
  layout,
  observation,
  showUnknown = false,
}) {
  const m = parkingMetrics(layout, observation)
  const cards = [
    ['Total Spaces', layout ? m.total : '\u2014', 'neutral', 'Layout capacity'],
    [
      'Available',
      m.hasData ? m.free : '\u2014',
      'good',
      'Spaces observed as free',
    ],
    [
      'Occupied',
      m.hasData ? m.occupied : '\u2014',
      'bad',
      'Spaces observed as occupied',
    ],
    [
      'Occupancy Rate',
      m.rate === null ? '\u2014' : `${m.rate}%`,
      'accent',
      'Occupied / total spaces',
    ],
  ]
  if (showUnknown)
    cards.push([
      'Unknown',
      layout ? m.unknown : '\u2014',
      'warning',
      'No matching observation',
    ])
  return (
    <>
      <div className={`kpi-grid ${showUnknown ? 'five' : ''}`}>
        {cards.map(([label, value, tone, note]) => (
          <article className={`kpi ${tone}`} key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{note}</small>
          </article>
        ))}
      </div>
      {m.unknown > 0 && (
        <p className="muted coverage">
          {m.unknown} spaces have unknown status. Occupancy rate uses total
          capacity; unknown spaces are not counted as available.
        </p>
      )}
    </>
  )
}
ParkingSummary.propTypes = {
  layout: PropTypes.object,
  observation: PropTypes.object,
  showUnknown: PropTypes.bool,
}

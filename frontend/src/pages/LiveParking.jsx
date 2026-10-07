import { useState } from 'react'
import PropTypes from 'prop-types'
import { PlayIcon, StopIcon } from '@radix-ui/react-icons'
import ParkingSummary, {
  Connection,
  DetectorInfo,
} from '../components/ParkingSummary'
import ParkingMap from '../components/ParkingMap'
import LayoutStatus from '../components/LayoutStatus'
import { spotLabel } from '../labels'
import { formatTime } from '../observation'
export default function LiveParking({ layout, feed }) {
  const [selected, setSelected] = useState(null)
  const spot = layout?.spots.find((item) => item.spot_id === selected)
  const observation = layout?.isSample ? null : feed.observation
  const confidence = observation?.confidence?.[selected]
  const status = observation?.spots?.[selected] ?? 'unknown'
  return (
    <>
      <div className="page-intro">
        <div>
          <span className="eyebrow">LIVE OPERATIONS</span>
          <h2>Every space. One view.</h2>
          <p>Select a polygon to inspect its latest observation.</p>
        </div>
        <Connection feed={feed} />
      </div>
      <ParkingSummary layout={layout} observation={observation} showUnknown />
      <section className="panel">
        <div className="panel-header">
          <h3>Live parking map</h3>
          <div className="actions">
            <button
              className="primary-button"
              disabled={feed.polling}
              title={
                feed.polling
                  ? 'Polling is already running. Use Stop to pause.'
                  : 'Fetch real backend occupancy updates.'
              }
              onClick={feed.start}
            >
              <PlayIcon />
              Start polling
            </button>
            <button
              className="secondary-button"
              disabled={!feed.polling}
              onClick={feed.stop}
            >
              <StopIcon />
              Stop
            </button>
          </div>
        </div>
        <DetectorInfo feed={feed} />
        <LayoutStatus layout={layout} />
        <p className="muted">
          {feed.polling
            ? 'Polling every three seconds. Start is disabled while polling is running.'
            : 'Polling paused. Choose Start polling to fetch new backend observations.'}{' '}
          A fresh detector observation is required for live data.
        </p>
        {layout?.spot_source === 'sample_handoff' && !layout.isSample && (
          <p className="notice">
            Published sample schematic. Colors and confidence come from real
            backend observations matched by spot ID, not from sample data.
          </p>
        )}
        {(feed.state === 'Stale' ||
          feed.state === 'Offline' ||
          !feed.polling) && (
          <p className="notice">
            Showing last known observations.{' '}
            {feed.state === 'Offline'
              ? 'Backend unavailable.'
              : !feed.polling
                ? 'Polling is paused.'
                : 'Detector data is stale.'}
          </p>
        )}
        <div className="live-grid">
          <ParkingMap
            layout={layout}
            observation={observation}
            onSpotClick={setSelected}
          />
          <aside className="spot-details">
            <span className="eyebrow">SPACE DETAILS</span>
            {layout && (
              <label className="spot-picker">
                Select parking space
                <select
                  value={spot ? selected : ''}
                  onChange={(event) => setSelected(event.target.value || null)}
                >
                  <option value="">Choose a space</option>
                  {layout.spots.map((item) => (
                    <option key={item.spot_id} value={item.spot_id}>
                      {spotLabel(item)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {spot ? (
              <>
                <h3>{spotLabel(spot)}</h3>
                <dl>
                  <dt>Spot ID</dt>
                  <dd>{spot.spot_id}</dd>
                  <dt>Current status</dt>
                  <dd
                    className={
                      status === 'free'
                        ? 'text-emerald-700'
                        : status === 'occupied'
                          ? 'text-red-700'
                          : ''
                    }
                  >
                    {status === 'free'
                      ? 'Available'
                      : status === 'occupied'
                        ? 'Occupied'
                        : 'Unknown'}
                  </dd>
                  <dt>Model confidence</dt>
                  <dd>
                    {typeof confidence === 'number' &&
                    Number.isFinite(confidence)
                      ? `${(confidence * 100).toFixed(1)}%`
                      : 'Not available'}
                  </dd>
                  <dt>Last observation time</dt>
                  <dd>
                    {status !== 'unknown'
                      ? formatTime(observation?.timestamp)
                      : 'Not available'}
                  </dd>
                </dl>
                <p className="muted">
                  Confidence is a raw model score. Status may be temporally
                  smoothed. Time is the snapshot timestamp; per-space
                  observation times are not provided.
                </p>
                <button
                  className="text-button"
                  onClick={() => setSelected(null)}
                >
                  Clear selection
                </button>
              </>
            ) : (
              <>
                <h3>Inspect a parking space</h3>
                <p>
                  Click a space on the map to see its label, status, and model
                  confidence.
                </p>
              </>
            )}
          </aside>
        </div>
      </section>
    </>
  )
}
LiveParking.propTypes = {
  layout: PropTypes.object,
  feed: PropTypes.object.isRequired,
}

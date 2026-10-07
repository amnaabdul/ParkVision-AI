import PropTypes from 'prop-types'
import useAlerts from '../hooks/useAlerts'
import { formatTime } from '../observation'

export default function RecentStateChanges({ onViewAll }) {
  const feed = useAlerts({ type: 'state_change', active_only: false, limit: 5 })
  const events = (feed.data?.items ?? []).filter(
    (item) => item.type === 'state_change'
  )
  return (
    <section className="panel" aria-label="Recent state changes">
      <div className="panel-header">
        <div>
          <h3>Recent state changes</h3>
          <p>
            Latest five recorded events, regardless of the active-condition
            filters above. These are historical observations, not currently
            active conditions.
          </p>
        </div>
        <button className="text-button" onClick={onViewAll}>
          View all state changes &rarr;
        </button>
      </div>
      {feed.loading ? (
        <p role="status">Loading state changes…</p>
      ) : feed.error ? (
        <p role="alert">
          State-change history unavailable. Current backend data could not be
          verified.
        </p>
      ) : events.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Space / state change</th>
                <th>Detector observation / receipt</th>
                <th>Layout</th>
                <th>Event state</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td>
                    <span className="badge">Info</span> {event.message}
                  </td>
                  <td>
                    {formatTime(event.observation_timestamp)}
                    <div className="muted">
                      Received: {formatTime(event.recorded_at)}
                    </div>
                  </td>
                  <td>
                    {event.layout_id != null
                      ? `Layout #${event.layout_id}`
                      : (event.cohort ?? 'Layout unrecorded')}
                  </td>
                  <td>Recorded state-change event</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>No recorded state changes yet.</p>
      )}
    </section>
  )
}
RecentStateChanges.propTypes = { onViewAll: PropTypes.func.isRequired }

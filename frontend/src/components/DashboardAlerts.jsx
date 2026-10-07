import PropTypes from 'prop-types'
import useAlerts from '../hooks/useAlerts'
import { formatTime } from '../observation'
export default function DashboardAlerts({ navigate }) {
  const feed = useAlerts({ active_only: true, limit: 3 })
  const items = feed.offline
    ? [feed.offline]
    : feed.error
      ? []
      : (feed.data?.items ?? []).filter((item) => item.severity !== 'Info')
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h3>Current alerts</h3>
          <p>Critical and warning conditions from real observations.</p>
        </div>
        <button className="text-button" onClick={() => navigate('alerts')}>
          Open Alerts &rarr;
        </button>
      </div>
      {feed.loading ? (
        <p>Checking alerts…</p>
      ) : items.length ? (
        <ul className="dashboard-alerts">
          {items.map((item) => (
            <li key={item.id}>
              <span
                className={`badge ${item.severity === 'Critical' ? 'bad' : 'warning'}`}
              >
                {item.severity}
              </span>{' '}
              {item.message}
              <small>
                {formatTime(item.observation_timestamp ?? item.event_time)}
              </small>
            </li>
          ))}
        </ul>
      ) : (
        <p>
          {feed.error
            ? 'Alerts unavailable; current conditions cannot be verified.'
            : 'No active parking alerts.'}
        </p>
      )}
    </section>
  )
}
DashboardAlerts.propTypes = { navigate: PropTypes.func.isRequired }

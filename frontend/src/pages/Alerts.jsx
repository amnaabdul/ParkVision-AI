import { useState } from 'react'
import useAlerts from '../hooks/useAlerts'
import AlertSettings from '../components/AlertSettings'
import RecentStateChanges from '../components/RecentStateChanges'
import { formatTime } from '../observation'
const TYPES = {
  high_occupancy: 'High occupancy',
  detector_stale: 'Detector stale',
  low_confidence: 'Low model confidence',
  state_change: 'Space state change',
  backend_offline: 'Backend unavailable',
}
export default function Alerts() {
  const [severity, setSeverity] = useState('')
  const [type, setType] = useState('')
  const [active, setActive] = useState(true)
  const [offset, setOffset] = useState(0)
  const feed = useAlerts({
    severity: severity || undefined,
    type: type && type !== 'backend_offline' ? type : undefined,
    active_only: active,
    limit: 50,
    offset,
  })
  const cached = feed.data?.items ?? []
  const items = [
    ...(feed.offline ? [feed.offline] : []),
    ...(!feed.error || !active ? cached : []),
  ].filter(
    (item) =>
      (!severity || item.severity === severity) && (!type || item.type === type)
  )
  const summary = feed.error
    ? {
        active: feed.offline ? 1 : '—',
        critical: feed.offline ? 1 : '—',
        warnings: feed.offline ? 0 : '—',
        latest_alert: feed.offline,
      }
    : feed.data?.summary
  return (
    <>
      <div className="page-intro">
        <div>
          <span className="eyebrow">OPERATIONS INBOX</span>
          <h2>Alerts</h2>
          <p>
            Real detector conditions and recorded state changes. Checked every
            five seconds.
          </p>
        </div>
        <button onClick={feed.refresh}>Refresh alerts</button>
      </div>
      <div className="kpi-grid">
        {[
          ['Active alerts', summary?.active],
          ['Critical', summary?.critical],
          ['Warnings', summary?.warnings],
          [
            'Latest alert',
            summary?.latest_alert
              ? formatTime(summary.latest_alert.event_time)
              : '—',
          ],
        ].map(([label, value]) => (
          <section className="kpi" key={label}>
            <span>{label}</span>
            <strong>{value ?? '—'}</strong>
          </section>
        ))}
      </div>
      <section className="panel">
        <div className="alert-filters">
          <label>
            Severity
            <select
              value={severity}
              onChange={(event) => {
                setSeverity(event.target.value)
                setOffset(0)
              }}
            >
              <option value="">All severities</option>
              {['Critical', 'Warning', 'Info'].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            Alert type
            <select
              value={type}
              onChange={(event) => {
                setType(event.target.value)
                setOffset(0)
              }}
            >
              <option value="">All types</option>
              {Object.entries(TYPES).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Activity
            <select
              value={active ? 'active' : 'all'}
              onChange={(event) => {
                setActive(event.target.value === 'active')
                setOffset(0)
              }}
            >
              <option value="active">Active only</option>
              <option value="all">All recorded conditions / events</option>
            </select>
          </label>
        </div>
        {feed.error && (
          <p role="alert" className="alert-error">
            {feed.error} Cached detector alerts are unverified.
          </p>
        )}
        {feed.loading ? (
          <p role="status">Loading alerts…</p>
        ) : items.length ? (
          <div className="table-scroll">
            <table className="history-table">
              <thead>
                <tr>
                  {[
                    'Severity / type',
                    'Message / space',
                    'Detector observation / receipt',
                    'State',
                    'Layout',
                  ].map((label) => (
                    <th key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <span
                        className={`badge ${item.severity === 'Critical' ? 'bad' : item.severity === 'Warning' ? 'warning' : ''}`}
                      >
                        {item.severity}
                      </span>
                      <div>{TYPES[item.type]}</div>
                    </td>
                    <td>
                      {item.message}
                      {item.spot_id && (
                        <small>
                          {item.spot_label} / {item.spot_id}
                        </small>
                      )}
                    </td>
                    <td>
                      {item.source === 'browser health check' ? (
                        `Browser health check: ${formatTime(item.event_time)}`
                      ) : (
                        <>
                          {formatTime(item.observation_timestamp)}
                          <small>
                            Received: {formatTime(item.recorded_at)}
                          </small>
                        </>
                      )}
                    </td>
                    <td>
                      {feed.error && item.source !== 'browser health check'
                        ? 'Unverified cached condition'
                        : item.active
                          ? 'Active / current'
                          : 'Recorded event'}
                    </td>
                    <td>
                      {item.layout_id != null
                        ? `Layout #${item.layout_id}`
                        : item.cohort
                          ? `Layout unrecorded / ${item.cohort}`
                          : 'Not applicable'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <h3>
              {feed.error
                ? 'Alerts unavailable'
                : severity || type || !active
                  ? 'No alerts match these filters.'
                  : 'No active parking alerts.'}
            </h3>
            <p>
              {feed.data?.quality?.observations === 0
                ? 'No detector observations have been stored yet.'
                : 'No simulated alerts are shown.'}
            </p>
          </div>
        )}
        {!feed.error &&
          type !== 'backend_offline' &&
          (feed.data?.total > 50 || offset > 0) && (
            <div className="alert-pagination">
              <button
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - 50))}
              >
                Previous alerts
              </button>
              <span>
                {offset + 1}–{Math.min(offset + 50, feed.data.total)} of{' '}
                {feed.data.total}
              </span>
              <button
                disabled={offset + 50 >= feed.data.total}
                onClick={() => setOffset(offset + 50)}
              >
                Next alerts
              </button>
            </div>
          )}
        <p className="status-note">
          Detector state:{' '}
          {feed.error
            ? 'Unverified'
            : (feed.data?.detector_state ?? 'Checking')}
          . State changes compare consecutive observations of the same recorded
          layout; uncertain legacy comparisons are skipped. Historical
          conditions are recalculated using current settings, not acknowledged
          or resolved incidents.
        </p>
        {!!feed.data?.quality?.latest_missing_confidence && (
          <p>
            {feed.data.quality.latest_missing_confidence} reported spaces have
            no usable model confidence; no low-confidence value is inferred.
          </p>
        )}
      </section>
      <RecentStateChanges
        onViewAll={() => {
          setSeverity('Info')
          setType('state_change')
          setActive(false)
          setOffset(0)
        }}
      />
      <AlertSettings onSaved={feed.refresh} />
    </>
  )
}

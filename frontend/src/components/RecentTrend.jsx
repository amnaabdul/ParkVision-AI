import PropTypes from 'prop-types'
import useManagementData from '../hooks/useManagementData'
import TrendChart from './TrendChart'
export default function RecentTrend({ timestamp }) {
  const result = useManagementData('/analytics/summary', {}, timestamp)
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h3>Recent occupancy trend</h3>
          <p>Real detector history / observation-based occupancy</p>
        </div>
        <button className="text-button" onClick={result.refresh}>
          Refresh trend
        </button>
      </div>
      {result.loading ? (
        <p role="status">Loading trend...</p>
      ) : result.error ? (
        <p role="alert">Trend unavailable. {result.error}</p>
      ) : (
        <>
          <TrendChart items={result.data.trend.slice(-20)} compact />
          {result.data.quality.mixed_layouts && (
            <p className="muted">
              Multiple cohorts; lines break when the recorded layout changes.
            </p>
          )}
        </>
      )}
    </section>
  )
}
RecentTrend.propTypes = { timestamp: PropTypes.string }

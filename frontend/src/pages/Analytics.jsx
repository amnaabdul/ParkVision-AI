import { useEffect, useState } from 'react'
import useManagementData from '../hooks/useManagementData'
import ObservationFilters from '../components/ObservationFilters'
import TrendChart from '../components/TrendChart'
import SpotUtilization from '../components/SpotUtilization'
import { dateParams, percent } from '../analytics'
import { formatTime, freshness } from '../observation'
export default function Analytics() {
  const [filters, setFilters] = useState({ start: '', end: '', cohort: 'all' })
  const result = useManagementData('/analytics/summary', dateParams(filters))
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const data = result.data,
    summary = data?.summary
  const currentState = freshness(
    data?.current
      ? {
          timestamp: data.current.timestamp,
          spots: Object.fromEntries(
            data.current.spaces.map((spot) => [spot.spot_id, spot.status])
          ),
        }
      : null,
    result.error ? 'offline' : 'connected',
    now
  )
  return (
    <>
      <div className="page-intro">
        <div>
          <span className="eyebrow">PARKING INTELLIGENCE</span>
          <h2>Occupancy analytics</h2>
          <p>
            Measured observations. Clear denominators. No inferred vehicle
            arrivals.
          </p>
        </div>
        <button className="secondary-button" onClick={result.refresh}>
          Refresh analytics
        </button>
      </div>
      <section className="panel">
        <ObservationFilters
          filters={filters}
          onChange={setFilters}
          cohorts={data?.cohorts}
        />
        <p className="muted">
          Historical metrics use the selected date range and layout cohort.
          Current occupancy is the latest received detector snapshot across all
          history.
        </p>
      </section>
      {result.loading ? (
        <section className="panel empty" role="status">
          <h3>Loading analytics...</h3>
        </section>
      ) : result.error ? (
        <section className="panel empty" role="alert">
          <h3>Analytics unavailable</h3>
          <p>{result.error}</p>
        </section>
      ) : (
        data && (
          <>
            <div className="kpi-grid">
              <article className="kpi neutral">
                <span>Observations</span>
                <strong>{summary.observations}</strong>
                <small>
                  {summary.received_observations} received /{' '}
                  {summary.duplicate_observations} exact replays excluded
                </small>
              </article>
              <article className="kpi accent">
                <span>Average Occupancy</span>
                <strong>{percent(summary.average_occupancy_rate)}</strong>
                <small>
                  Mean of {summary.usable_observations} usable snapshot rates
                </small>
              </article>
              <article className="kpi bad">
                <span>Peak Occupancy</span>
                <strong>{percent(summary.max_occupancy_rate)}</strong>
                <small>{formatTime(summary.peak_timestamp)}</small>
              </article>
              <article className="kpi good">
                <span>Current Occupancy</span>
                <strong>{percent(data.current?.occupancy_rate)}</strong>
                <small>
                  {currentState} / {formatTime(data.current?.timestamp)}
                </small>
              </article>
            </div>
            <section className="panel analytics-method">
              <h3>Observation-based analytics</h3>
              <p>
                Each snapshot rate is occupied / valid reported spaces. Missing
                spaces are not free. Utilization is occupied observations /
                observations containing that space, not parked duration.
                Distinct closely spaced snapshots retain equal weight, so
                sampling frequency affects these metrics.
              </p>
              <p className="muted">
                Minimum observed occupancy:{' '}
                {percent(summary.min_occupancy_rate)}. Current detector
                timestamp and receipt time:{' '}
                {formatTime(data.current?.timestamp)} /{' '}
                {formatTime(data.current?.recorded_at)}.
              </p>
              {data.quality.mixed_layouts && (
                <p className="notice">
                  Multiple layout cohorts are selected. Aggregate rates compare
                  reported-space shares across different layouts. Select one
                  cohort for a consistent comparison; chart lines break at
                  cohort changes.
                </p>
              )}
              {data.quality.unrecorded_layout_observations > 0 && (
                <p className="notice">
                  {data.quality.unrecorded_layout_observations} observations
                  have no recorded layout identity. They are grouped by reported
                  spot-ID set. Geometry and historical owner labels cannot be
                  reconstructed; ID-derived labels are used.
                </p>
              )}
              {(data.quality.partial_observations > 0 ||
                data.quality.missing_timestamp_observations > 0) && (
                <p className="notice">
                  {data.quality.partial_observations} partial snapshots;{' '}
                  {data.quality.missing_timestamp_observations} missing or
                  invalid timestamps. Undated observations are omitted from time
                  charts and date-filtered results.
                </p>
              )}
              {!summary.observations && (
                <div className="chart-empty">
                  <h3>No observations in this selection</h3>
                  <p>
                    Adjust filters or collect real detector observations to
                    build a history.
                  </p>
                </div>
              )}
            </section>
            <div className="analytics-grid">
              <section className="panel">
                <h3>Occupancy rate over time</h3>
                <TrendChart items={data.trend} />
              </section>
              <section className="panel">
                <h3>Available vs Occupied over time</h3>
                <TrendChart items={data.trend} counts />
              </section>
            </div>
            {data.quality.trend_truncated && (
              <p className="notice">
                Charts show the latest {data.quality.trend_limit} dated
                observations. Summary statistics cover the full selection.
              </p>
            )}
            <section className="panel">
              <h3>Per-space observation frequency</h3>
              <p>
                Occupied observation count and observation-based utilization,
                separated by layout cohort.
              </p>
              <SpotUtilization spots={data.spots} cohorts={data.cohorts} />
            </section>
          </>
        )
      )}
    </>
  )
}

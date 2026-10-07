import { Fragment, useState } from 'react'
import useManagementData from '../hooks/useManagementData'
import ObservationFilters from '../components/ObservationFilters'
import { cohortLabel, dateParams, percent } from '../analytics'
import { formatTime } from '../observation'
export default function History() {
  const [filters, setFilters] = useState({
    start: '',
    end: '',
    cohort: 'all',
    state: 'all',
  })
  const [offset, setOffset] = useState(0)
  const [expanded, setExpanded] = useState(null)
  const result = useManagementData('/analytics/history', {
    ...dateParams(filters),
    state: filters.state,
    limit: 50,
    offset,
  })
  const data = result.data
  return (
    <>
      <div className="page-intro">
        <div>
          <span className="eyebrow">OBSERVATION LOG</span>
          <h2>Parking history</h2>
          <p>
            Real detector snapshots, newest observation first. These are not
            vehicle arrivals.
          </p>
        </div>
        <button className="secondary-button" onClick={result.refresh}>
          Refresh
        </button>
      </div>
      <section className="panel">
        <ObservationFilters
          filters={filters}
          onChange={(value) => {
            setFilters(value)
            setOffset(0)
            setExpanded(null)
          }}
          cohorts={data?.cohorts}
          stateFilter
        />
        <p className="muted">
          Date filters use your local calendar days. Rates use reported valid
          spaces, not assumed lot capacity.
        </p>
        {result.loading ? (
          <div className="empty" role="status">
            <h3>Loading observations...</h3>
          </div>
        ) : result.error ? (
          <div className="empty" role="alert">
            <h3>History unavailable</h3>
            <p>{result.error}</p>
          </div>
        ) : !data?.items.length ? (
          <div className="empty">
            <h3>
              {filters.start ||
              filters.end ||
              filters.state !== 'all' ||
              filters.cohort !== 'all'
                ? 'No observations match these filters'
                : 'No recorded observations yet'}
            </h3>
            <p>Change the filters or publish more detector observations.</p>
          </div>
        ) : (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Observation time</th>
                    <th>Backend receipt</th>
                    <th>Reported spaces</th>
                    <th>Available</th>
                    <th>Occupied</th>
                    <th>Occupancy rate</th>
                    <th>Source / layout</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <Fragment key={item.id}>
                      <tr>
                        <td>{formatTime(item.timestamp)}</td>
                        <td>{formatTime(item.recorded_at)}</td>
                        <td>{item.total_observed}</td>
                        <td>{item.available}</td>
                        <td>{item.occupied}</td>
                        <td>{percent(item.occupancy_rate)}</td>
                        <td>
                          Detector / {cohortLabel(item.cohort, data.cohorts)}
                          {item.missing_layout_spots > 0 && (
                            <small>
                              {' '}
                              / {item.missing_layout_spots} layout spaces
                              missing
                            </small>
                          )}
                        </td>
                        <td>
                          <button
                            className="text-button"
                            aria-expanded={expanded === item.id}
                            onClick={() =>
                              setExpanded(expanded === item.id ? null : item.id)
                            }
                          >
                            {expanded === item.id
                              ? 'Collapse'
                              : 'Inspect spaces'}
                          </button>
                        </td>
                      </tr>
                      {expanded === item.id && (
                        <tr>
                          <td colSpan={8}>
                            <div className="observation-details">
                              <h3>Recorded spaces</h3>
                              {!item.spaces.length ? (
                                <p>
                                  No valid spot statuses in this observation.
                                </p>
                              ) : (
                                <table>
                                  <thead>
                                    <tr>
                                      <th>Label</th>
                                      <th>Spot ID</th>
                                      <th>Recorded status</th>
                                      <th>Model confidence</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {item.spaces.map((spot) => (
                                      <tr key={spot.spot_id}>
                                        <td>{spot.label}</td>
                                        <td>{spot.spot_id}</td>
                                        <td>{spot.status}</td>
                                        <td>
                                          {typeof spot.confidence === 'number'
                                            ? percent(spot.confidence * 100)
                                            : 'Not available'}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                              <p className="muted">
                                Model confidence is a raw score. Historical
                                records remain unchanged; repeated snapshots are
                                not counted as arrivals.
                              </p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <span>
                {offset + 1} to{' '}
                {Math.min(offset + data.items.length, data.total)} of{' '}
                {data.total} observations
              </span>
              <button
                className="secondary-button"
                disabled={offset === 0}
                onClick={() => {
                  setOffset(Math.max(0, offset - 50))
                  setExpanded(null)
                }}
              >
                Previous
              </button>
              <button
                className="secondary-button"
                disabled={offset + 50 >= data.total}
                onClick={() => {
                  setOffset(offset + 50)
                  setExpanded(null)
                }}
              >
                Next
              </button>
            </div>
          </>
        )}
      </section>
    </>
  )
}

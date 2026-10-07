import PropTypes from 'prop-types'
import { cohortLabel, percent } from '../analytics'
export default function SpotUtilization({ spots, cohorts }) {
  if (!spots.length)
    return (
      <div className="chart-empty">
        <h3>No space observations yet</h3>
        <p>
          Per-space frequency appears when detector snapshots contain valid
          statuses.
        </p>
      </div>
    )
  return (
    <>
      <div className="utilization-bars">
        {spots.slice(0, 24).map((spot) => (
          <div
            className="utilization-row"
            key={`${spot.cohort}-${spot.spot_id}`}
            tabIndex={0}
            title={`${spot.label} (${spot.spot_id}) / ${cohortLabel(spot.cohort, cohorts)}: occupied ${spot.occupied} of ${spot.observed} observations; ${percent(spot.utilization_rate)}`}
          >
            <span>
              {spot.label}
              <small>{cohortLabel(spot.cohort, cohorts)}</small>
            </span>
            <span className="bar-track">
              <span style={{ width: `${spot.utilization_rate}%` }} />
            </span>
            <strong>{percent(spot.utilization_rate)}</strong>
          </div>
        ))}
      </div>
      {spots.length > 24 && (
        <p className="muted">
          Showing the 24 highest frequencies. All spaces are listed below.
        </p>
      )}
      <div className="table-scroll space-statistics">
        <table>
          <thead>
            <tr>
              <th>Space</th>
              <th>Layout</th>
              <th>Observed</th>
              <th>Occupied observations</th>
              <th>Available observations</th>
              <th>Observation-based utilization</th>
            </tr>
          </thead>
          <tbody>
            {spots.map((spot) => (
              <tr key={`${spot.cohort}-${spot.spot_id}`}>
                <td>
                  {spot.label} <small>{spot.spot_id}</small>
                </td>
                <td>{cohortLabel(spot.cohort, cohorts)}</td>
                <td>{spot.observed}</td>
                <td>{spot.occupied}</td>
                <td>{spot.available}</td>
                <td>{percent(spot.utilization_rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
SpotUtilization.propTypes = {
  spots: PropTypes.array.isRequired,
  cohorts: PropTypes.array.isRequired,
}

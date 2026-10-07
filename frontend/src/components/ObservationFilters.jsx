import PropTypes from 'prop-types'
export default function ObservationFilters({
  filters,
  onChange,
  cohorts = [],
  stateFilter = false,
}) {
  const change = (key, value) => onChange({ ...filters, [key]: value })
  return (
    <div className="observation-filters">
      <label>
        From date
        <input
          type="date"
          value={filters.start}
          max={filters.end || undefined}
          onChange={(event) => change('start', event.target.value)}
        />
      </label>
      <label>
        Through date
        <input
          type="date"
          value={filters.end}
          min={filters.start || undefined}
          onChange={(event) => change('end', event.target.value)}
        />
      </label>
      <label>
        Layout cohort
        <select
          value={filters.cohort}
          onChange={(event) => change('cohort', event.target.value)}
        >
          <option value="all">All recorded cohorts</option>
          {cohorts.map((cohort) => (
            <option key={cohort.id} value={cohort.id}>
              {cohort.label}
            </option>
          ))}
        </select>
      </label>
      {stateFilter && (
        <label>
          Contains status
          <select
            value={filters.state}
            onChange={(event) => change('state', event.target.value)}
          >
            <option value="all">Any status</option>
            <option value="free">Available spaces</option>
            <option value="occupied">Occupied spaces</option>
          </select>
        </label>
      )}
      <button
        className="text-button"
        onClick={() =>
          onChange({ start: '', end: '', cohort: 'all', state: 'all' })
        }
      >
        Clear filters
      </button>
    </div>
  )
}
ObservationFilters.propTypes = {
  filters: PropTypes.object.isRequired,
  onChange: PropTypes.func.isRequired,
  cohorts: PropTypes.array,
  stateFilter: PropTypes.bool,
}

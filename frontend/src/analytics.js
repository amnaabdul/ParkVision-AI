export function percent(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${value.toFixed(1)}%`
    : 'Not available'
}
export function dateParams(filters) {
  const params = { cohort: filters.cohort || 'all' }
  // Date-picker values represent days in the browser timezone. Send UTC instants.
  if (filters.start)
    params.start = new Date(`${filters.start}T00:00:00`).toISOString()
  if (filters.end) {
    const end = new Date(`${filters.end}T00:00:00`)
    end.setDate(end.getDate() + 1)
    params.end = new Date(end.getTime() - 1).toISOString()
  }
  return params
}
export function cohortLabel(cohort, cohorts = []) {
  return (
    cohorts.find((item) => item.id === cohort)?.label ?? 'Layout unrecorded'
  )
}

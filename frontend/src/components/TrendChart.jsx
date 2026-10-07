import { useState } from 'react'
import PropTypes from 'prop-types'
import { formatTime } from '../observation'
import { percent } from '../analytics'
export default function TrendChart({ items, counts = false, compact = false }) {
  const [hovered, setHovered] = useState(null)
  const rows = items.filter((item) =>
    Number.isFinite(Date.parse(item.timestamp))
  )
  const usable = rows.filter((row) => row.total_observed > 0)
  if (
    usable.length < 2 ||
    new Set(usable.map((row) => Date.parse(row.timestamp))).size < 2
  )
    return (
      <div className="chart-empty">
        <h3>
          {usable.length
            ? 'Only one distinct dated observation'
            : 'No dated observations yet'}
        </h3>
        <p>
          At least two real observations are needed to show a trend. Run the
          detector on additional images to collect observations.
        </p>
      </div>
    )
  const width = 800,
    height = compact ? 200 : 270,
    left = 48,
    right = 22,
    top = 20,
    bottom = 45
  const first = Date.parse(rows[0].timestamp),
    last = Date.parse(rows.at(-1).timestamp)
  const max = counts
    ? Math.max(1, ...rows.map((row) => Math.max(row.available, row.occupied)))
    : 100
  const x = (row) =>
    left +
    ((Date.parse(row.timestamp) - first) / (last - first || 1)) *
      (width - left - right)
  const y = (value) => height - bottom - (value / max) * (height - top - bottom)
  const series = counts
    ? [
        ['available', '#059669', 'Available'],
        ['occupied', '#dc5050', 'Occupied'],
      ]
    : [['occupancy_rate', '#0d9488', 'Occupancy']]
  const path = (key) => {
    let previous = null
    return rows
      .map((row) => {
        if (!row.total_observed || typeof row[key] !== 'number') {
          previous = null
          return ''
        }
        const command = previous === row.cohort ? 'L' : 'M'
        previous = row.cohort
        return `${command}${x(row)},${y(row[key])}`
      })
      .join(' ')
  }
  return (
    <div className="trend-chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={
          counts
            ? 'Available and occupied spaces over time'
            : 'Occupancy rate over time'
        }
      >
        <title>
          {counts
            ? 'Available and occupied spaces over time'
            : 'Occupancy rate over time'}
        </title>
        {[0, max / 2, max].map((value) => (
          <g key={value}>
            <line
              x1={left}
              x2={width - right}
              y1={y(value)}
              y2={y(value)}
              stroke="#e4eaf0"
            />
            <text
              x={left - 8}
              y={y(value) + 4}
              textAnchor="end"
              fontSize="11"
              fill="#78869a"
            >
              {counts ? value.toFixed(0) : `${value}%`}
            </text>
          </g>
        ))}
        {series.map(([key, color, label]) => (
          <g key={key}>
            <path d={path(key)} fill="none" stroke={color} strokeWidth="2.5" />
            {rows
              .filter(
                (row) => row.total_observed > 0 && typeof row[key] === 'number'
              )
              .map((row) => (
                <circle
                  key={row.id}
                  cx={x(row)}
                  cy={y(row[key])}
                  r="4"
                  fill={color}
                  tabIndex={0}
                  aria-label={`${formatTime(row.timestamp)}: ${label} ${counts ? row[key] : percent(row[key])}`}
                  onMouseEnter={() => setHovered(row)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(row)}
                  onBlur={() => setHovered(null)}
                >
                  <title>
                    {formatTime(row.timestamp)}: {label}{' '}
                    {counts ? row[key] : percent(row[key])}
                  </title>
                </circle>
              ))}
          </g>
        ))}
        {[rows[0], rows.at(-1)].map((row, index) => (
          <text
            key={index}
            x={index ? width - right : left}
            y={height - 12}
            textAnchor={index ? 'end' : 'start'}
            fontSize="11"
            fill="#78869a"
          >
            {formatTime(row.timestamp)}
          </text>
        ))}
      </svg>
      <div className="legend">
        {series.map(([, color, label]) => (
          <span key={label}>
            <i style={{ background: color }} />
            {label}
          </span>
        ))}
      </div>
      {hovered && (
        <div className="chart-tooltip" role="tooltip">
          <strong>{formatTime(hovered.timestamp)}</strong> /{' '}
          {percent(hovered.occupancy_rate)} occupied / {hovered.available}{' '}
          available / {hovered.occupied} occupied / {hovered.total_observed}{' '}
          observed
          <br />
          Received {formatTime(hovered.recorded_at)}
        </div>
      )}
    </div>
  )
}
TrendChart.propTypes = {
  items: PropTypes.array.isRequired,
  counts: PropTypes.bool,
  compact: PropTypes.bool,
}

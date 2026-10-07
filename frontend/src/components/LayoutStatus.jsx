import PropTypes from 'prop-types'
export default function LayoutStatus({ layout }) {
  return (
    <p className="layout-status">
      <span
        className={`badge ${layout?.isSample ? 'warning' : layout ? 'good' : ''}`}
      >
        {layout?.isSample
          ? 'Preview layout'
          : layout
            ? 'Published layout'
            : 'No layout loaded'}
      </span>
      {layout && (
        <span>
          {layout.spots.length} spaces
          {layout.spot_source === 'sample_handoff' ? ' · Sample schematic' : ''}
        </span>
      )}
    </p>
  )
}
LayoutStatus.propTypes = { layout: PropTypes.object }

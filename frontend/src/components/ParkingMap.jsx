import PropTypes from 'prop-types'
import LeafletMap from '../LeafletMap'
export default function ParkingMap({ layout, observation, onSpotClick }) {
  if (!layout)
    return (
      <div className="empty">
        <span className="empty-icon">P</span>
        <h3>Your parking map starts here</h3>
        <p>
          Open Owner Setup to generate a layout or load an explicit sample
          handoff.
        </p>
      </div>
    )
  return (
    <div>
      {layout.isSample && (
        <p className="notice">
          Sample handoff preview. These polygons are not published; live status
          is not applied. Open Owner Setup and choose Publish layout / Use for
          Live Parking to apply real backend observations.
        </p>
      )}
      <LeafletMap
        layout={layout}
        status={layout.isSample ? null : observation?.spots}
        onSpotClick={onSpotClick}
      />
      <div className="legend">
        <span>
          <i className="free" />
          Available
        </span>
        <span>
          <i className="occupied" />
          Occupied
        </span>
        <span>
          <i className="unknown" />
          Unknown
        </span>
      </div>
    </div>
  )
}
ParkingMap.propTypes = {
  layout: PropTypes.object,
  observation: PropTypes.object,
  onSpotClick: PropTypes.func,
}

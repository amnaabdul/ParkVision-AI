import PropTypes from 'prop-types'
import RecentTrend from '../components/RecentTrend'
import DashboardAlerts from '../components/DashboardAlerts'
import ParkingSummary, {
  Connection,
  DetectorInfo,
} from '../components/ParkingSummary'
import ParkingMap from '../components/ParkingMap'
import LayoutStatus from '../components/LayoutStatus'
import { formatTime, parkingMetrics } from '../observation'
export default function Dashboard({ layout, feed, navigate }) {
  const m = parkingMetrics(layout, feed.observation)
  return (
    <>
      <div className="page-intro">
        <div>
          <span className="eyebrow">OPERATIONS OVERVIEW</span>
          <h2>A clearer view of your parking.</h2>
          <p>
            Monitor capacity, availability, and detector health in one place.
          </p>
        </div>
        <Connection feed={feed} />
      </div>
      <ParkingSummary layout={layout} observation={feed.observation} />
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h3>Parking overview</h3>
              <p>Current layout / occupancy by space</p>
            </div>
            <button className="text-button" onClick={() => navigate('live')}>
              Open Live Parking &rarr;
            </button>
          </div>
          <div className="overview-map">
            <ParkingMap layout={layout} observation={feed.observation} />
          </div>
        </section>
        <section className="panel">
          <span className="eyebrow">SYSTEM STATUS</span>
          <h3>System status</h3>
          <LayoutStatus layout={layout} />
          <DetectorInfo feed={feed} />
          <div className="status-note">
            {feed.state === 'Live'
              ? 'Recent detector observations are available.'
              : feed.state === 'Stale'
                ? 'The detector has not published a recent update. Values shown are last known observations.'
                : feed.state === 'Offline'
                  ? 'The backend is unreachable. Any retained values are last known observations.'
                  : 'Waiting for usable detector observations.'}
          </div>
        </section>
      </div>
      <RecentTrend timestamp={feed.observation?.timestamp} />
      <DashboardAlerts navigate={navigate} />
      <section className="panel">
        <div className="panel-header">
          <div>
            <h3>Recent status information</h3>
            <p>The latest received snapshot, without simulated activity.</p>
          </div>
        </div>
        <div className="recent-grid">
          <div>
            <span>Last successful snapshot</span>
            <strong>{formatTime(feed.observation?.timestamp)}</strong>
          </div>
          <div>
            <span>Known spaces in this layout</span>
            <strong>
              {layout ? `${m.free + m.occupied} / ${m.total}` : 'No layout'}
            </strong>
          </div>
          <div>
            <span>Last backend check</span>
            <strong>{formatTime(feed.lastChecked)}</strong>
          </div>
        </div>
      </section>
    </>
  )
}
Dashboard.propTypes = {
  layout: PropTypes.object,
  feed: PropTypes.object.isRequired,
  navigate: PropTypes.func.isRequired,
}

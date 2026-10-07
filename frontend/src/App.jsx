import { useEffect, useState } from 'react'
import {
  DashboardIcon,
  LayersIcon,
  CounterClockwiseClockIcon,
  BarChartIcon,
  BellIcon,
  GearIcon,
  InfoCircledIcon,
} from '@radix-ui/react-icons'
import { api, API_BASE } from './api/client'
import { normalizeLayout } from './layout'
import useOccupancy from './hooks/useOccupancy'
import Dashboard from './pages/Dashboard'
import LiveParking from './pages/LiveParking'
import OwnerSetup from './pages/OwnerSetup'
import History from './pages/History'
import Analytics from './pages/Analytics'
import Alerts from './pages/Alerts'
import SystemInfo from './pages/SystemInfo'
const navigation = [
  ['dashboard', 'Dashboard', DashboardIcon],
  ['live', 'Live Parking', LayersIcon],
  ['history', 'History', CounterClockwiseClockIcon],
  ['analytics', 'Analytics', BarChartIcon],
  ['alerts', 'Alerts', BellIcon],
  ['setup', 'Owner Setup', GearIcon],
  ['info', 'System Info', InfoCircledIcon],
]
export default function App() {
  const [page, setPage] = useState('dashboard')
  const [layout, setLayout] = useState(null)
  const [layoutError, setLayoutError] = useState(null)
  const [reload, setReload] = useState(0)
  const feed = useOccupancy()
  useEffect(() => {
    const controller = new AbortController()
    api
      .get('/map', { signal: controller.signal })
      .then(({ data }) => {
        if (controller.signal.aborted) return
        const normalized = normalizeLayout(data, { apiBase: API_BASE })
        if (!normalized) throw new Error('Invalid layout')
        setLayout(normalized)
        setLayoutError(null)
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setLayoutError(
            error.response?.status === 404
              ? 'No published layout. Open Owner Setup to get started.'
              : 'Could not load the published layout. Check the backend connection and retry.'
          )
      })
    return () => controller.abort()
  }, [reload])
  const updateLayout = (value) => {
    setLayout(value)
    setLayoutError(null)
  }
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <aside className="sidebar">
        <a
          className="brand"
          href="#dashboard"
          onClick={(event) => {
            event.preventDefault()
            setPage('dashboard')
          }}
        >
          <span className="brand-mark">
            P<span>&#9670;</span>
          </span>
          <div>
            <strong>ParkVision AI</strong>
            <small>Smart Parking Management &amp; Analytics System</small>
          </div>
        </a>
        <span className="nav-caption">WORKSPACE</span>
        <nav aria-label="Main navigation">
          {navigation.map(([id, label, Icon]) => (
            <button
              key={id}
              className={`nav-item ${page === id ? 'active' : ''}`}
              aria-current={page === id ? 'page' : undefined}
              onClick={() => setPage(id)}
            >
              <Icon />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="sidebar-dot" />
          AI-assisted parking operations
          <small>Visibility. Confidence. Control.</small>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span>
            Workspace{' '}
            <span className="breadcrumb">
              / {navigation.find(([id]) => id === page)[1]}
            </span>
          </span>
          <span className="workspace-label">
            PARKING MANAGEMENT & ANALYTICS
          </span>
        </header>
        <main id="main-content" tabIndex={-1}>
          <div className="page-heading">
            <h1>{navigation.find(([id]) => id === page)[1]}</h1>
            <span className="muted">ParkVision AI</span>
          </div>
          {layoutError && (
            <div className="notice" role="status">
              {layoutError}{' '}
              <button
                className="text-button"
                onClick={() => setReload((value) => value + 1)}
              >
                Retry layout
              </button>
            </div>
          )}
          {page === 'dashboard' && (
            <Dashboard layout={layout} feed={feed} navigate={setPage} />
          )}
          {page === 'live' && <LiveParking layout={layout} feed={feed} />}
          {page === 'history' && <History />}
          {page === 'analytics' && <Analytics />}
          {page === 'alerts' && <Alerts />}
          {page === 'info' && <SystemInfo />}
          <div hidden={page !== 'setup'}>
            <OwnerSetup
              layout={layout}
              setLayout={updateLayout}
              onPublished={() => {
                feed.stop()
                setPage('live')
              }}
            />
          </div>
        </main>
        <footer className="main-footer">
          ParkVision AI | Smart Parking Management & Analytics System
        </footer>
      </div>
    </div>
  )
}

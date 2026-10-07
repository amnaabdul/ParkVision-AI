export default function SystemInfo() {
  return (
    <>
      <div className="page-intro">
        <div>
          <span className="eyebrow">ABOUT PARKVISION AI</span>
          <h2>Smart Parking Management &amp; Analytics System</h2>
          <p>Computer vision observations, clear operational context.</p>
        </div>
      </div>
      <section className="panel">
        <h3>How the system works</h3>
        <ol className="architecture-flow" aria-label="Architecture flow">
          {[
            'Camera / Image',
            'Edge AI Detector',
            'FastAPI',
            'SQLite',
            'Management Dashboard',
          ].map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p>
          The edge detector classifies parking-space images and sends occupancy
          observations to FastAPI. SQLite stores snapshots and their recorded
          layout context. The React dashboard polls for updates and presents
          real history, observation-based analytics, and operational alerts.
        </p>
      </section>
      <section className="panel">
        <h3>Reading the data</h3>
        <ul className="system-notes">
          <li>
            Live Parking checks the backend every three seconds while polling is
            enabled. An observation becomes stale after 15 seconds; a successful
            poll does not refresh detector age.
          </li>
          <li>
            Model confidence is a model score, not a calibrated probability.
            Missing values remain unknown.
          </li>
          <li>
            Utilization measures occupied observations out of observations
            reported for a space. It does not measure parking duration or
            vehicle counts.
          </li>
          <li>
            State changes are observed space-status transitions between
            compatible recorded layouts. They are historical events, not active
            conditions or automatically inferred vehicle arrivals or departures.
          </li>
          <li>
            Sample handoff geometry is an explicit preview until published.
            Occupancy always comes from actual detector observations.
          </li>
        </ul>
      </section>
      <section className="panel">
        <h3>Integrated components</h3>
        <p>
          ParkVision AI integrates an existing computer-vision occupancy pipeline
          with a management dashboard, persistent history, observation-based
          analytics, and operational alerts. Existing components, datasets, and
          model weights are not claimed as newly authored or trained by the
          course team. Source licensing is documented in LICENSE.md; model and
          dataset terms are documented separately in MODEL_LICENSE.md.
        </p>
      </section>
    </>
  )
}

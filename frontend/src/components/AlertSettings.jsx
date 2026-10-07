import { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { api } from '../api/client'
function SettingsForm({ settings, onSaved }) {
  const [draft, setDraft] = useState(settings)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const fields = [
    ['high_occupancy_percent', 'High occupancy (%)', 1, 100],
    ['low_confidence_percent', 'Low model confidence (%)', 0, 100],
    ['detector_stale_seconds', 'Detector stale threshold (seconds)', 0, null],
  ]
  const submit = async (event) => {
    event.preventDefault()
    const values = Object.fromEntries(
      fields.map(([name]) => [name, Number(draft[name])])
    )
    if (
      fields.some(
        ([name, , min, max]) =>
          String(draft[name]).trim() === '' ||
          !Number.isFinite(values[name]) ||
          values[name] < min ||
          (max !== null && values[name] > max)
      ) ||
      values.detector_stale_seconds <= 0
    ) {
      setError(
        'Occupancy must be 1â€“100%, confidence 0â€“100%, and stale seconds greater than zero.'
      )
      return
    }
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await api.put('/alerts/settings', values)
      setSaved(true)
      onSaved()
    } catch (failure) {
      setError(
        failure.response?.status === 401
          ? 'Sign in with an owner token in Owner Setup before saving.'
          : 'Could not save settings. Check the backend and retry.'
      )
    } finally {
      setSaving(false)
    }
  }
  return (
    <form onSubmit={submit} noValidate>
      <div className="alert-settings-grid">
        {fields.map(([name, label, min, max]) => (
          <label key={name}>
            {label}
            <input
              type="number"
              step="any"
              min={min}
              max={max ?? undefined}
              value={draft[name]}
              disabled={saving}
              onChange={(event) => {
                setDraft({ ...draft, [name]: event.target.value })
                setSaved(false)
              }}
            />
          </label>
        ))}
      </div>
      {error && (
        <p role="alert" className="alert-error">
          {error}
        </p>
      )}
      {saved && <p role="status">Settings saved.</p>}
      <button className="primary-button" disabled={saving}>
        {saving ? 'Savingâ€¦' : 'Save alert settings'}
      </button>
    </form>
  )
}
SettingsForm.propTypes = {
  settings: PropTypes.object.isRequired,
  onSaved: PropTypes.func.isRequired,
}
export default function AlertSettings({ onSaved }) {
  const [settings, setSettings] = useState(null)
  const [error, setError] = useState(null)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    api
      .get('/alerts/settings', { signal: controller.signal })
      .then(({ data }) => {
        if (controller.signal.aborted) return
        if (
          ![
            'high_occupancy_percent',
            'low_confidence_percent',
            'detector_stale_seconds',
          ].every((name) => Number.isFinite(data?.[name]))
        )
          throw new Error('Invalid settings')
        setSettings(data)
        setError(null)
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('Alert settings unavailable.')
      })
    return () => controller.abort()
  }, [revision])
  return (
    <section className="panel">
      <h3>Alert settings</h3>
      <p>
        Thresholds apply to alert rules. Live Parking retains its existing
        15-second freshness indicator. Model confidence is an uncalibrated model
        score.
      </p>
      {error ? (
        <>
          <p role="alert">{error}</p>
          <button onClick={() => setRevision((value) => value + 1)}>
            Retry settings
          </button>
        </>
      ) : settings ? (
        <SettingsForm settings={settings} onSaved={onSaved} />
      ) : (
        <p role="status">Loading alert settingsâ€¦</p>
      )}
    </section>
  )
}
AlertSettings.propTypes = { onSaved: PropTypes.func.isRequired }

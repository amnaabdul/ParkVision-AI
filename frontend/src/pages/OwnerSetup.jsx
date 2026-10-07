import { useState, useRef } from 'react'
import PropTypes from 'prop-types'
import { CameraIcon, ArrowRightIcon, UpdateIcon } from '@radix-ui/react-icons'
import LeafletMap from '../LeafletMap'
import { normalizeLayout } from '../layout'
import { spotLabel, applyLabelEdit } from '../labels'
import { api, API_BASE } from '../api/client'
const spotShape = PropTypes.shape({
  spot_id: PropTypes.string.isRequired,
  corners: PropTypes.arrayOf(PropTypes.arrayOf(PropTypes.number)).isRequired,
})

const layoutShape = PropTypes.shape({
  isSample: PropTypes.bool,
  canvas: PropTypes.shape({
    width: PropTypes.number,
    height: PropTypes.number,
  }),
  background_image: PropTypes.string,
  source_images: PropTypes.arrayOf(PropTypes.string),
  spot_source: PropTypes.string,
  spots: PropTypes.arrayOf(spotShape),
})

const SAMPLE_LAYOUT = {
  canvas: { width: 600, height: 400 },
  background_image: 'bev_map.png',
  source_images: ['img_001.jpg', 'img_002.jpg', 'img_003.jpg'],
  spot_source: 'placeholder_grid',
  spots: [
    {
      spot_id: 'spot_1',
      corners: [
        [40, 60],
        [110, 60],
        [110, 130],
        [40, 130],
      ],
    },
    {
      spot_id: 'spot_2',
      corners: [
        [120, 60],
        [190, 60],
        [190, 130],
        [120, 130],
      ],
    },
    {
      spot_id: 'spot_3',
      corners: [
        [200, 60],
        [270, 60],
        [270, 130],
        [200, 130],
      ],
    },
    {
      spot_id: 'spot_4',
      corners: [
        [280, 60],
        [350, 60],
        [350, 130],
        [280, 130],
      ],
    },
    {
      spot_id: 'spot_5',
      corners: [
        [360, 60],
        [430, 60],
        [430, 130],
        [360, 130],
      ],
    },
    {
      spot_id: 'spot_6',
      corners: [
        [440, 60],
        [510, 60],
        [510, 130],
        [440, 130],
      ],
    },
    {
      spot_id: 'spot_7',
      corners: [
        [40, 220],
        [110, 220],
        [110, 310],
        [40, 310],
      ],
    },
    {
      spot_id: 'spot_8',
      corners: [
        [120, 220],
        [190, 220],
        [190, 310],
        [120, 310],
      ],
    },
    {
      spot_id: 'spot_9',
      corners: [
        [200, 220],
        [270, 220],
        [270, 310],
        [200, 310],
      ],
    },
    {
      spot_id: 'spot_10',
      corners: [
        [280, 220],
        [350, 220],
        [350, 310],
        [280, 310],
      ],
    },
    {
      spot_id: 'spot_11',
      corners: [
        [360, 220],
        [430, 220],
        [430, 310],
        [360, 310],
      ],
    },
    {
      spot_id: 'spot_12',
      corners: [
        [440, 220],
        [510, 220],
        [510, 310],
        [440, 310],
      ],
    },
  ],
}

function Spinner() {
  return <UpdateIcon className="w-5 h-5 text-stone-500 animate-spin shrink-0" />
}

// ---------------------------------------------------------------------------
// AuthControls — optional owner sign-in (used when backend AUTH_ENABLED)
// ---------------------------------------------------------------------------
function AuthControls() {
  const [username, setUsername] = useState('')
  const [token, setToken] = useState(() =>
    typeof localStorage !== 'undefined'
      ? localStorage.getItem('spp_token')
      : null
  )
  const [err, setErr] = useState(null)

  const register = async () => {
    setErr(null)
    if (!username) return
    try {
      const { data } = await api.post('/auth/register', { username })
      localStorage.setItem('spp_token', data.token)
      setToken(data.token)
    } catch (e) {
      setErr(
        e?.response?.status === 409
          ? 'Username taken — reuse your existing token.'
          : 'Could not register (is auth enabled on the backend?).'
      )
    }
  }

  const signOut = () => {
    localStorage.removeItem('spp_token')
    setToken(null)
  }

  if (token) {
    return (
      <div className="flex items-center gap-2 mb-4 text-sm text-stone-500">
        <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
        Signed in as owner
        <button
          onClick={signOut}
          className="text-xs px-2 py-0.5 rounded-md border border-stone-200 hover:bg-stone-50 cursor-pointer"
        >
          Sign out
        </button>
      </div>
    )
  }

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Owner username (optional)"
          aria-label="Owner username"
          className="text-sm border border-stone-300 rounded-md px-2 py-1"
        />
        <button
          onClick={register}
          className="text-xs px-2.5 py-1 rounded-md border border-stone-300 bg-white hover:bg-stone-50 cursor-pointer"
        >
          Get owner token
        </button>
      </div>
      {err && <p className="text-xs text-red-600 mt-1">{err}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// SpotLabelsEditor — owner correction step (labels only)
// ---------------------------------------------------------------------------
function SpotLabelsEditor({ layout, setLayout }) {
  const [drafts, setDrafts] = useState(() =>
    Object.fromEntries(layout.spots.map((s) => [s.spot_id, spotLabel(s)]))
  )
  const [savingId, setSavingId] = useState(null)
  const [savedId, setSavedId] = useState(null)
  const [err, setErr] = useState(null)

  const save = async (spotId) => {
    setSavingId(spotId)
    setSavedId(null)
    setErr(null)
    try {
      if (!layout.isSample)
        await api.patch(`/spots/${encodeURIComponent(spotId)}`, {
          label: drafts[spotId],
        })
      setLayout(applyLabelEdit(layout, spotId, drafts[spotId]))
      setSavedId(spotId)
    } catch {
      setErr(`Could not save ${spotId}. Is the backend running?`)
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="mt-5 border border-stone-200 rounded-xl p-4">
      <p className="text-sm font-medium text-stone-800 mb-3">
        Correct spot labels
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {layout.spots.map((spot) => (
          <div key={spot.spot_id} className="flex items-center gap-2">
            <span className="text-xs font-mono text-stone-400 w-16 shrink-0">
              {spot.spot_id}
            </span>
            <input
              aria-label={`Label for ${spot.spot_id}`}
              value={drafts[spot.spot_id] ?? ''}
              onChange={(e) =>
                setDrafts((d) => ({ ...d, [spot.spot_id]: e.target.value }))
              }
              className="flex-1 min-w-0 text-sm border border-stone-300 rounded-md px-2 py-1"
            />
            <button
              onClick={() => save(spot.spot_id)}
              disabled={savingId === spot.spot_id}
              className="text-xs px-2.5 py-1 rounded-md border border-stone-300 bg-white
                         hover:bg-stone-50 transition-colors cursor-pointer disabled:opacity-40"
            >
              {savedId === spot.spot_id ? 'Saved' : 'Save'}
            </button>
          </div>
        ))}
      </div>
      {err && <p className="text-sm text-red-600 mt-2">{err}</p>}
    </div>
  )
}

SpotLabelsEditor.propTypes = {
  layout: layoutShape,
  setLayout: PropTypes.func.isRequired,
}

// ---------------------------------------------------------------------------
// OwnerSetup
// ---------------------------------------------------------------------------
export default function OwnerSetup({ layout, setLayout, onPublished }) {
  const [files, setFiles] = useState([])
  const [step, setStep] = useState('idle')
  const [error, setError] = useState(null)
  const [publishing, setPublishing] = useState(false)
  const fileRef = useRef()

  const publishSample = async () => {
    if (!layout?.isSample || publishing) return
    setPublishing(true)
    setError(null)
    const payload = {
      canvas: layout.canvas,
      background_image: null,
      source_images: [],
      spot_source: 'sample_handoff',
      spots: layout.spots.map((spot) => ({
        spot_id: spot.spot_id,
        label: spotLabel(spot),
        corners: spot.corners,
      })),
    }
    let saved = false
    try {
      await api.post('/map', payload)
      saved = true
      const { data } = await api.get('/map')
      const published = normalizeLayout(data, { apiBase: API_BASE })
      const matches =
        published?.spot_source === 'sample_handoff' &&
        published.spots.length === payload.spots.length &&
        payload.spots.every((expected) =>
          published.spots.some(
            (spot) =>
              spot.spot_id === expected.spot_id &&
              spot.label === expected.label &&
              JSON.stringify(spot.corners) === JSON.stringify(expected.corners)
          )
        )
      if (!matches)
        throw new Error('Published layout did not match the preview')
      setLayout(published)
      onPublished?.()
    } catch (err) {
      setError(
        err?.response?.status === 401
          ? 'Publishing requires an owner token. Sign in above and retry.'
          : saved
            ? 'The layout was submitted, but its saved version could not be confirmed. Preview remains unchanged. Check the backend and retry Publish layout.'
            : 'Could not publish the layout. Preview remains unchanged. Check the backend connection and retry.'
      )
    } finally {
      setPublishing(false)
    }
  }

  const handleFiles = (e) => {
    const picked = Array.from(e.target.files).filter((f) =>
      f.type.startsWith('image/')
    )
    setFiles(picked)
    setStep('ready')
    setError(null)
  }

  const submit = async () => {
    if (files.length < 3) {
      setError('Upload at least 3 photos for reliable SfM.')
      return
    }
    setStep('processing')
    setError(null)

    const form = new FormData()
    files.forEach((f) => form.append('images', f))

    try {
      // POST /layout runs SfM server-side and returns the stored layout.
      const { data } = await api.post('/layout', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setLayout(normalizeLayout(data, { apiBase: API_BASE }))
      setStep('done')
    } catch (err) {
      if (err?.response?.status === 422) {
        // SfM could not build a usable layout — fall back to manual entry.
        setError(
          'SfM could not build a layout from these photos. Submit spot polygons manually (POST /map) or load the sample handoff below.'
        )
        setStep('ready')
        return
      }
      setError(
        'Layout upload failed. Your existing layout is preserved. Check the backend connection and owner token, then retry.'
      )
      setStep('ready')
    }
  }

  const reset = () => {
    setFiles([])
    setStep('idle')
    setError(null)
    setLayout(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="panel setup-panel">
      <AuthControls />
      {layout?.isSample && (
        <p className="notice">
          Sample handoff preview - not published to the backend. Live occupancy
          is not applied to sample geometry.
        </p>
      )}
      <p className="text-base text-stone-500 mb-5 leading-relaxed">
        Upload overlapping photos of your parking lot to run the layout
        pipeline. Review the resulting polygons and spot source before using the
        layout for live parking.
      </p>

      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Select parking lot photos"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            fileRef.current?.click()
          }
        }}
        className="border-2 border-dashed border-stone-300 rounded-2xl p-10 text-center bg-stone-50
                   cursor-pointer hover:border-stone-400 transition-colors"
        onClick={() => fileRef.current?.click()}
      >
        <div className="flex justify-center mb-3">
          <CameraIcon className="w-12 h-12 text-stone-400" />
        </div>
        <p className="text-base font-medium text-stone-800">
          {files.length
            ? `${files.length} photo${files.length > 1 ? 's' : ''} selected`
            : 'Click to select photos'}
        </p>
        <p className="text-sm text-stone-400 mt-1.5">
          JPG or PNG · minimum 3 images · 60%+ overlap recommended
        </p>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/*"
          onChange={handleFiles}
          className="hidden"
        />
      </div>

      {/* File chips */}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {files.map((f, i) => (
            <span
              key={i}
              className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-md font-mono"
            >
              {f.name}
            </span>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-red-600 mt-2.5">{error}</p>}

      {/* Actions */}
      {(step === 'idle' || step === 'ready') && (
        <div className="flex gap-3 mt-6">
          <button
            onClick={submit}
            disabled={files.length === 0}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-stone-400
                       bg-white text-sm font-medium hover:bg-stone-50 transition-colors
                       disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            Run SfM layout
            <ArrowRightIcon className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              setLayout({ ...normalizeLayout(SAMPLE_LAYOUT), isSample: true })
              setStep('done')
            }}
            className="px-5 py-3 rounded-lg border border-stone-200 bg-transparent text-sm
                       text-stone-500 hover:bg-stone-50 transition-colors cursor-pointer"
          >
            Load sample handoff
          </button>
        </div>
      )}

      {step === 'processing' && (
        <div className="flex items-center gap-3 py-4">
          <Spinner />
          <span className="text-sm text-stone-500">Running SfM pipeline…</span>
        </div>
      )}

      {/* Layout preview */}
      {layout && (
        <fieldset className="mt-8" disabled={publishing}>
          {layout.isSample && (
            <div className="notice">
              <p>
                Publish this 12-space sample schematic as the current parking
                layout to apply real backend observations by spot ID. This
                replaces the published map; it does not generate detector data.
                Save any label corrections below before publishing.
              </p>
              <button className="primary-button" onClick={publishSample}>
                {publishing
                  ? 'Publishing layout...'
                  : 'Publish layout / Use for Live Parking'}
              </button>
            </div>
          )}
          {!layout.isSample && layout.spot_source === 'sample_handoff' && (
            <p className="notice" role="status">
              Sample schematic published. Real occupancy and confidence are
              matched by spot ID. Open Live Parking and click Start polling.
            </p>
          )}
          <div className="flex justify-between items-center mb-3">
            <p className="text-base font-medium text-stone-800">
              Layout ready — {layout.spots.length} spots detected
            </p>
            <span className="text-xs font-mono text-stone-500 bg-stone-100 px-2.5 py-1 rounded-md">
              {layout.spot_source}
            </span>
          </div>
          <LeafletMap layout={layout} />
          <SpotLabelsEditor
            key={layout.spots.map((s) => s.spot_id).join()}
            layout={layout}
            setLayout={setLayout}
          />
          <div className="flex gap-3 mt-3 items-center">
            <button
              onClick={reset}
              className="text-sm px-4 py-2 rounded-lg border border-stone-200 bg-transparent
                         text-stone-500 hover:bg-stone-50 transition-colors cursor-pointer"
            >
              Re-upload
            </button>
            <span className="text-sm text-stone-500">
              {layout.canvas && (
                <>
                  Canvas {layout.canvas.width}×{layout.canvas.height} ·{' '}
                </>
              )}
              {layout.source_images?.length ?? 0} source images
            </span>
          </div>
        </fieldset>
      )}
    </div>
  )
}

OwnerSetup.propTypes = {
  layout: layoutShape,
  setLayout: PropTypes.func.isRequired,
  onPublished: PropTypes.func,
}

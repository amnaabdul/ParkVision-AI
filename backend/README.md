# Backend Layer

The backend is a FastAPI persistence and coordination layer for the ParkVision AI edge pipeline. It stores occupancy updates, serves the parking lot layout to edge nodes at startup, and supports the Find My Car feature.

## Running the Backend

```bash
source .venv/bin/activate
make backend
```

API docs available at: `http://127.0.0.1:8000/docs`

`make backend` binds uvicorn to `0.0.0.0:8000` so Expo/mobile devices on the
same Wi-Fi can reach the API through the host machine's LAN IP. To run local-only, use:

```bash
make backend BACKEND_HOST=127.0.0.1
```

---

## Endpoints

### Occupancy

#### `POST /update`
Receives an occupancy payload from the edge node and persists it to the `log` table. Also writes a row per spot into `park_sessions`.

**Request body:**
```json
{
  "spots": {
    "spot_1": "free",
    "spot_2": "occupied"
  },
  "confidence": {
    "spot_1": 0.91,
    "spot_2": 0.84
  },
  "timestamp": "2026-04-21T00:00:00Z"
}
```

**Response:**
```json
{ "status": "ok" }
```

---

#### `GET /status`
Returns the latest occupancy snapshot. Frontend should read `response.spots` for occupancy data.

**Response shape (final, confirmed):**
```json
{
  "spots": {
    "spot_1": "free",
    "spot_2": "occupied"
  },
  "confidence": {
    "spot_1": 0.91,
    "spot_2": 0.84
  },
  "timestamp": "2026-04-21T00:00:00Z"
}
```

> **Frontend note (@mirzayv):** Read occupancy as `response.spots`, confidence as `response.confidence`. This shape is final and will not change.

---

#### `GET /history?limit=100`
Returns recent occupancy snapshots in reverse chronological order.

**Response:**
```json
{
  "items": [
    {
      "payload": {
        "spots": { "spot_1": "free" },
        "confidence": { "spot_1": 0.91 },
        "timestamp": "2026-04-21T00:00:00Z"
      },
      "recorded_at": "2026-04-21T00:00:01Z"
    }
  ]
}
```

---

### Parking Lot Layout

> **Canonical route is `/map`**. The `/layout` route is an alias kept for frontend compatibility — both routes accept the same payload and return the same response.

#### `POST /map` (alias: `POST /layout`)
Saves the parking lot layout. Accepts spot polygons using either `points` or `corners` field — both are supported.

**Request body:**
```json
{
  "spots": [
    {
      "spot_id": "spot_1",
      "points": [[x1,y1],[x2,y2],[x3,y3],[x4,y4]],
      "label": "A1"
    }
  ],
  "image_width": 1920,
  "image_height": 1080,
  "canvas": {"width": 2560, "height": 1440},
  "background_image": "bev_map.png",
  "spot_source": "placeholder_grid",
  "source_images": ["img_001.jpg"]
}
```

> **Note:** `corners` is accepted as an alias for `points` (used by ML pipeline output). `canvas`, `background_image`, `spot_source`, and `source_images` are optional metadata fields that are round-tripped verbatim by `GET /map`.

**Response:**
```json
{ "status": "ok", "spots_saved": 15 }
```

#### `POST /layout` with image uploads (owner setup → server-side SfM)

When `POST /layout` receives `multipart/form-data` with one or more `images`
files, the backend runs the SfM pipeline (`ml/sfm_layout.generate_layout`)
in-process: it builds a bird's-eye-view canvas, extracts spot polygons, persists
the layout (same as `POST /map`), writes the BEV to `artifacts/layout_sample/bev_map.png`
(served by `GET /map/background`), and returns the stored layout.

**Request:** `multipart/form-data` with one or more `images` fields.

**Fallback:** if SfM cannot produce a usable layout (too few/unreadable photos),
the route responds `422`. The app then falls back to **manual polygon
submission** via `POST /map` with a precomputed `LayoutPayload` (JSON body) — this
JSON path is the documented owner-setup fallback.

---

#### `GET /map` (alias: `GET /layout`)
Returns the latest parking lot layout. Called by `edge/detect.py` at startup to load spot polygons, and by both apps on launch to render the lot map.

**Response:**
```json
{
  "spots": [
    {
      "spot_id": "spot_1",
      "points": [[x1,y1],[x2,y2],[x3,y3],[x4,y4]],
      "label": "A1"
    }
  ],
  "image_width": 1920,
  "image_height": 1080,
  "canvas": {"width": 2560, "height": 1440},
  "background_image": "bev_map.png",
  "spot_source": "placeholder_grid",
  "source_images": ["img_001.jpg"],
  "updated_at": "2026-04-21T00:00:00Z"
}
```

> Returns `404` if no layout has been posted yet.

---

#### `GET /map/background`
Serves `artifacts/layout_sample/bev_map.png` as a PNG image for use as the map background in both apps.

> Returns `404` if the file is not present.

---

### Spot Correction & References

#### `PATCH /spots/{spot_id}`
Owner correction step: rename a spot's label after layout generation. Updates
`spot_references` and rewrites the latest `layout` row so `GET /map` reflects the
new label. Geometry is left unchanged.

**Request body:** `{ "label": "VIP-1" }`

**Response:** `{ "spot_id": "spot_1", "label": "VIP-1" }`

> Returns `404` if the spot is unknown.

#### `POST /spots/{spot_id}/references`
Stores one or more reference photos for a spot under
`artifacts/spot_references/<spot_id>/` and records them in `spot_reference_images`.
These per-spot references are what Find My Car (`POST /park`) matches against.

**Request:** `multipart/form-data` with one or more `photos` fields.

**Response:** `{ "spot_id": "spot_1", "saved": 2, "paths": [...] }`

#### `GET /spots/{spot_id}/references`
Lists stored reference photos for a spot:
`{ "spot_id": "spot_1", "references": [{"path": ..., "created_at": ...}], "count": 2 }`

---

### Parking Sessions

#### `GET /sessions?spot_id=spot_1&limit=100`
Returns recent parking session records. Optionally filter by `spot_id`.

**Response:**
```json
{
  "sessions": [
    {
      "spot_id": "spot_1",
      "status": "occupied",
      "confidence": 0.91,
      "recorded_at": "2026-04-21T00:00:00Z"
    }
  ],
  "count": 1
}
```

---

### Find My Car (mobile only)

#### `POST /park`
Accepts a driver photo, runs SIFT feature matching against the owner-managed
per-spot references in `artifacts/spot_references/` (falling back to the bundled
`samples/localization_refs/` when none have been uploaded), inserts a row into
`park_sessions`, and returns a `session_id` for later lookup.

Used by: **Mobile** — Find My Car screen.

**Request:** `multipart/form-data` with field `photo` (image file).

**Response:**
```json
{
  "session_id": 42,
  "spot_id": "spot_7",
  "similarity_score": 14.031,
  "elapsed_ms": 312.5,
  "localized": true
}
```

> `localized: false` if SIFT matching failed to find a confident match.

---

#### `GET /find/{session_id}`
Looks up a parking session by ID and returns the spot location with corner coordinates for map display.

Used by: **Mobile** — Find My Car screen.

**Response:**
```json
{
  "session_id": 42,
  "spot_id": "spot_7",
  "corners": [[x1,y1],[x2,y2],[x3,y3],[x4,y4]],
  "similarity_score": 14.031,
  "recorded_at": "2026-04-21T00:00:00Z"
}
```

> Returns `404` if session not found.

---

### Utilities

#### `GET /health`
Service health check (also reports whether auth is enforced).

```json
{ "status": "ok", "auth_enabled": false }
```

#### `GET /stream`
Serves `logs/latest_frame.jpg` as a multipart MJPEG stream for browser or VLC clients.

```html
<img src="http://127.0.0.1:8000/stream" alt="Parking stream">
```

---

### Authentication (optional)

Auth is **opt-in** so the demo runs token-free by default. Set `AUTH_ENABLED=1`
when starting the backend to require bearer tokens on owner-mutating routes
(`POST /map`, `POST /layout`, `PATCH /spots/{id}`, `POST /spots/{id}/references`)
and to scope Find My Car sessions to their owner.

#### `POST /auth/register`
Issues a bearer token for an owner (lightweight, no password).

**Request body:** `{ "username": "owner" }`
**Response:** `{ "user_id": 1, "username": "owner", "token": "..." }`

Send the token as `Authorization: Bearer <token>` on protected routes. With auth
on, `POST /park` stamps the session's owner and `GET /find/{session_id}` returns
`404` for sessions owned by a different user. Read-only routes (`GET /status`,
`GET /map`) stay public.

---

## Database Schema

SQLite database at `parking.db`:

| Table | Purpose |
|---|---|
| `log` | Full occupancy payload snapshots from edge |
| `layout` | Parking lot layout snapshots (quad polygons) |
| `spot_references` | Per-spot polygon coordinates + label |
| `spot_reference_images` | Per-spot Find My Car reference photo paths |
| `park_sessions` | Per-spot occupancy history + Find My Car sessions (with optional `user_id`) |
| `users` | Owner accounts + bearer tokens (when auth is enabled) |

---

## Bandwidth

The edge node POSTs compact JSON (~280 bytes) every 2 seconds instead of streaming raw video.

| Method | Bandwidth |
|---|---|
| JSON POST (this system) | 0.3 KB/s |
| H.264 720p stream | 200 KB/s |
| H.264 1080p stream | 500 KB/s |

**Result: 99.9% bandwidth reduction vs raw video streaming.**


## ParkVision management analytics

Additive endpoints preserve `/history`, `/sessions`, `/status`, and all existing
owner/mobile contracts:

- `GET /analytics/history`: newest detector observation first; expandable
  `spaces` including recorded status/confidence/label. Query `start` and `end`
  accept timezone-qualified ISO instants (inclusive), `cohort` selects a layout
  cohort, `state=all|free|occupied` filters snapshots containing that state,
  `limit=1..200` and nonnegative `offset` paginate results.
- `GET /analytics/summary`: same date/cohort filters; returns summary KPIs,
  chronological trend (latest 1,000 dated snapshots), per-space counts, current
  snapshot, cohort choices and data-quality metadata. Current is the latest
  received log globally, independent of historical filters, matching `/status`.

`init_db` creates `detector_context(log_id, layout_id, layout_data)` idempotently.
`/update` captures the active layout and its labels/geometry alongside each new
log, in the same transaction. The original payload and session writes are
unchanged. No historical context is inferred or backfilled. Context identifies
which layout the backend had at receipt; it does not prove an edge process has
reloaded its geometry after a layout change. Restart the updated backend to
activate routes/migration. Back up the SQLite database before upgrading.

Analytics use `log` only, never `park_sessions`. Snapshot occupancy is
`100 * occupied / valid reported spaces`. Average is the arithmetic mean of
nonempty snapshot rates, and min/max are extrema of those rates. Peak time is
the detector timestamp of the highest-rate snapshot (latest observed time wins
when tied). Per-space observation-based utilization is
`100 * occupied observations / observations containing that space`.
Missing spaces are excluded rather than counted as free. Confidence is optional
and does not weight these metrics. No arrival, turnover, or duration claims are
made. Historical filters use detector time; backend receipt remains separate.

Identical timezone-normalized timestamps, space statuses/confidence and cohort
are counted once for analytics (newest receipt retained), while history retains
all receipt records. Distinct closely spaced observations retain equal weight:
sampling frequency can bias the observation-based rates. Invalid timestamps
remain visible in unfiltered history but are excluded from date filters and
trends. Empty snapshot rates are null. Stale current data remains labeled stale
with the existing 15-second freshness threshold.

Per-space statistics are separated by captured layout ID. For legacy logs,
cohorts are separated by the reported spot-ID set, explicitly marked layout
unrecorded; reused IDs with changed geometry cannot be disambiguated. Mixed
cohort aggregate rates are reported-space shares across possibly different
capacities. Select one cohort for comparisons; chart lines break at cohort
changes and missing observations. Read-time aggregation scans the detector log;
large production archives would benefit from indexed normalized observations or
materialized summaries.

### Snapshot-derived alerts (Milestone 3)

`GET /alerts` derives a deterministic feed from `log` snapshots and their recorded
`detector_context`. It never interprets `park_sessions` rows as vehicle arrivals.
Settings are persisted in the additive singleton `alert_settings` table, initialized
idempotently at startup. Existing data/routes remain unchanged.

- `GET /alerts/settings`: current settings and last settings update timestamp.
- `PUT /alerts/settings`: numeric `high_occupancy_percent` (1–100),
  `low_confidence_percent` (0–100), `detector_stale_seconds` (>0). Defaults 80, 70, 15.
  Uses the existing owner authentication dependency when authentication is enabled.
- `GET /alerts`: optional `severity` (Info/Warning/Critical), `type`
  (high_occupancy/detector_stale/low_confidence/state_change), `active_only`,
  `limit` (1–200), `offset`. Summary counts describe all active conditions,
  independently of filters. Active first, then severity, then newest event.

High occupancy: occupied / valid reported free-or-occupied spaces × 100 >= threshold.
Missing layout spaces are not counted as free. Low model confidence: a real score
in [0,1] × 100 < threshold; missing/invalid scores are skipped. Stale: elapsed UTC
seconds since the latest received snapshot's detector timestamp > threshold.
Receipt time never refreshes detector age. Future times beyond the existing
five-second tolerance have unknown freshness; no current condition is asserted.
State changes require consecutive distinct detector-time-ordered observations with
the same recorded layout ID, valid increasing timestamps, no unmapped spots, and
both states reported for the space. All uncertain legacy comparisons are skipped.
State changes are historical Info events, not active incidents or vehicle movements.

Exact replays are deduplicated with the analytics snapshot identity. Stable event
IDs exclude receipt time. Closely spaced distinct observations remain real events;
no debounce or dwell-time inference is imposed. Active conditions use the latest
received observation, consistent with `/status`. Stale high occupancy/low confidence
remain visible with an explicit stale qualification. Historical conditions are
recomputed under current settings; this is not an acknowledgement/resolution audit
log. Historical stale intervals cannot be reconstructed from snapshot data alone.

The browser checks alerts every five seconds and, only after alerts fail, probes
`/health`. A transport failure or health 5xx produces a transient Critical browser
outage alert. A responding backend with an alerts-route error does not. Outage
checks cannot distinguish a stopped server from browser/network reachability, and
are not persisted. Cached detector conditions become unverified during errors.
Live Parking keeps its existing fixed 15-second freshness indicator; configurable
stale settings affect alerts only. No inference, mobile contracts, or polling
controls are changed. No external notifications or incident acknowledgement is
included. Alert derivation scans stored snapshots; large archives may need indexing
and incremental aggregation in a later milestone.

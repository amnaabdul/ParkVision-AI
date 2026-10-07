# ParkVision AI demo guide

Use real detector inference only. Start from the repository root. Keep the current
SQLite data and model; this guide does not reset the database or predict outputs.

## Preflight

Run `.\scripts\start-dev.ps1` to check prerequisites and print startup commands.
Complete the [README setup](../README.md) first. Verify the classifier exists at
`acpds_cls/weights/best.pt`. On Windows, prefer `--device cpu` to override the
existing Apple MPS config. The sample image paths below exist in the repository.

## Presentation sequence

1. **Start FastAPI** in terminal 1:
   ```powershell
   .\.venv\Scripts\Activate.ps1
   python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
   ```
   Open `http://localhost:8000/health`; a response verifies the backend, not fresh
   detector data. API documentation is at `/docs`.
2. **Start the frontend** in terminal 2:
   ```powershell
   cd frontend
   npm run dev -- --port 5173 --strictPort
   ```
   Install dependencies once with `npm install` if needed; do not install during
   every presentation. Open `http://localhost:5173`.
3. **Dashboard:** point out capacity, last known occupied/free counts, freshness,
   backend connection, layout status, trend and alerts. A connected backend can
   have stale detector data. Empty history is a legitimate state.
4. **Owner Setup:** inspect the current published 12-space layout and label
   corrections. Preserve it if suitable. If no suitable published map exists,
   load the sample handoff, show the preview distinction, then explicitly choose
   **Publish layout / Use for Live Parking**. This replaces the map and does not
   generate observations. Do not republish between the two detector observations.
   A sample schematic is not a calibrated map of the camera image. Explain photo
   upload / SfM without promising success for incompatible photos.
5. **Run actual inference** in terminal 3, repository root:
   ```powershell
   .\.venv\Scripts\Activate.ps1
   python edge\detect.py --image "samples\live_occupancy\frame_04_GOPR0089.JPG" --device cpu --post
   ```
   Show the printed detector payload and verify posting succeeded. No ML model
   is retrained. Predictions vary with weights/configuration and geometry.
6. **Live Parking:** choose **Start polling** if paused. If **Stop** is enabled,
   polling is already running. Show the new detector timestamp and real colors;
   select a space by polygon or the keyboard-accessible dropdown. Explain model
   confidence as a score, not probability. Single-image data becomes stale after
   15 seconds; rerun inference to create another real observation if needed.
7. **History:** locate the new timestamp, recorded layout identity and counts.
   Expand the observation for individual spaces. Detector and receipt timestamps
   are distinct. Legacy rows may show an unrecorded layout; do not relabel them.
8. **Analytics:** select the recorded layout cohort when avoiding older unlike
   geometry. Show real occupancy trends and observation-based per-space
   utilization. Sparse data supports a limited comparison, not parking duration
   or a count of vehicles. No observation means no invented chart.
9. **Alerts:** show genuine low-confidence/stale conditions when present and the
   validated settings. Current active counts exclude recorded state-change
   events. Stale warnings are expected while the detector is idle; they do not
   imply FastAPI is offline. Do not change thresholds merely to fabricate a
   desired result; explain any intentional rule change.
10. **Post a second compatible observation**, keeping the published layout:
    ```powershell
    python edge\detect.py --image "samples\live_occupancy\frame_05_GOPR0090.JPG" --device cpu --post
    ```
    Verify the new History row has the same recorded layout identity. Show
    **Recent state changes** and **View all state changes** on Alerts. These
    events compare actual reported states, not vehicle arrivals/departures.
    Changes and confidence values depend on actual inference; no guaranteed
    spot count or transition list is prescribed here. The recent section shows
    the latest five events; use its full-history button for more.
11. **System Info:** conclude with the architecture and honest data limitations,
    including data semantics and licensing information.

## Recovery and shutdown

If the backend is unavailable, restore it and use the existing retry/refresh
controls; never seed fake status. If Start is disabled, polling is already on;
use Stop then Start to demonstrate controls. If data is stale, run a detector
observation rather than changing browser time. If layouts differ, retain history
and post two new observations under one compatible published layout.

Stop each development service using Ctrl+C in its terminal. Do not delete
`parking.db`, logs, photos or layouts to clean the demo. A port-conflict error
means another process is using the port; do not terminate unknown services.
The helper starts no background processes and does not hide service errors.

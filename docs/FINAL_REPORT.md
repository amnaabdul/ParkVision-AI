# ParkVision AI: AI-Powered Smart Parking Management and Analytics System

**Final Project Report**

**Team Members** - Amna Jabarin - Mohammad Ziyadat - Fihmi Sbeih

## Abstract

ParkVision AI is a smart parking management and analytics system that
integrates an existing computer-vision occupancy pipeline with a
management-oriented web interface and additional operational
capabilities. The completed system connects computer-vision occupancy
observations to a FastAPI backend, SQLite persistence, and a React/Vite
dashboard. It provides live parking status, historical observations,
observation-based analytics, operational alerts, owner setup tools, and
system information.

The project focuses on turning detector output into information that a
parking operator can inspect and use. Particular attention was given to
preserving the semantics of the underlying observations: missing parking
spaces are not automatically treated as free, model confidence is
displayed as detector confidence rather than a calibrated probability,
and changes between observations are reported as state changes rather
than inferred vehicle arrivals or departures.

## 1. Introduction

Parking occupancy detection is only one part of a useful smart-parking
system. A detector may determine whether individual parking spaces
appear occupied or free, but an operator also needs a way to view the
current state, understand recent observations, inspect trends, identify
unusual conditions, and configure the monitored layout.

ParkVision AI addresses this management layer. The system combines an
edge computer-vision pipeline with a backend service and a browser-based
management dashboard. The team's implemented work focuses on the redesigned
management experience, historical observation views, analytics, alerts,
supporting APIs, testing, documentation, and demo-oriented workflow improvements.
Existing components, datasets, and model weights are integrated rather than
claimed as newly authored or trained by the team.

The main goals of the project were to:

-   present detector observations in a clear live parking interface;
-   retain historical observations for later inspection;
-   calculate analytics without inventing missing information;
-   derive operational alerts deterministically from recorded data;
-   preserve owner/layout setup functionality;
-   make detector freshness and confidence visible to the user; and
-   provide a reproducible workflow suitable for demonstrating the
    complete system.

## 2. System Description

### 2.1 Overall Architecture

The main data flow is:

**Camera / Image → Edge AI Detector → FastAPI Backend → SQLite →
Management Dashboard**

The edge component processes an image using the configured parking-space
geometry and the project's existing Ultralytics YOLO-based model
weights. Occupancy observations are sent to the backend. The FastAPI
service exposes the current status and supporting management endpoints
and stores observation data in SQLite. The React/Vite frontend retrieves
these records and presents them to the operator.

The browser does not start the AI detector. When live polling is
enabled, it periodically requests the latest status from the backend.
This distinction is important: frontend polling retrieves the latest
observation; inference is performed by the edge pipeline.

### 2.2 Main User-Facing Areas

**Dashboard.** Provides a management overview of the current parking
state, including availability/occupancy summaries, detector freshness,
recent trends, and relevant alerts.

**Live Parking.** Presents the configured parking layout and the latest
reported state of each parking space. Individual spaces can expose
details such as the reported state and detector confidence.

**History.** Allows recorded occupancy snapshots to be reviewed and
filtered. Historical records remain observations rather than being
reinterpreted as parking sessions.

**Analytics.** Calculates occupancy and per-space utilization statistics
from recorded snapshots. The analytics are explicitly observation-based.

**Alerts.** Shows operational conditions derived from stored
observations and configured thresholds, including high occupancy, low
confidence, stale detector data, and recorded state changes.

**Owner Setup.** Supports parking-layout setup and the existing owner
workflow, including layout publication and use of sample data in the
demonstration workflow.

**System Info.** Documents system behavior, architecture, and important
data semantics inside the management interface.

## 3. Architecture and Data Semantics

### 3.1 Edge Detection

The canonical detector workflow loads parking-space geometries from the
backend layout, extracts the relevant parking-space image regions, and
applies the project's existing Ultralytics YOLO-based classification
model. The resulting states and confidence values form an occupancy
observation that can be posted to the backend.

The project uses existing model weights. Therefore, this report does not claim authorship of the
original model or training dataset, nor does it claim a new measured
detection accuracy.

### 3.2 Backend and Persistence

FastAPI provides the interface between the detector and management
frontend. SQLite stores observation history and configuration required
by the management features. The backend also retains detector context
for newer observations so that historical records can be associated with
the active layout where that information is available.

The system distinguishes detector timestamps from the time at which data
is viewed. This supports freshness checks without pretending that an old
observation represents the current physical state.

### 3.3 Frontend

The management application is implemented using React and Vite. It uses
API client and hook layers to retrieve backend data and separates major
functionality into dedicated pages and reusable components. The
interface uses a responsive dashboard layout designed for
parking-management use rather than silently substituting randomly
generated data when the backend is unavailable.

### 3.4 Observation Semantics

Several rules were used to keep the displayed information technically
meaningful:

1.  A missing space in an observation is not assumed to be free.
2.  Detector confidence is treated as model confidence, not as a
    calibrated probability that the displayed state is correct.
3.  A state difference between consecutive compatible observations is a
    recorded state change. It is not automatically labeled as a vehicle
    arrival or departure.
4.  Analytics are calculated from the observation log, not from invented
    parking sessions.
5.  Replayed observations with exact historical timestamps can remain
    visible in History while being excluded from analytics where
    appropriate.

These rules reduce the risk of presenting conclusions that the recorded
data does not support.

## 4. Implementation

### 4.1 Live Occupancy Management

The Live Parking page connects the published layout with real backend
occupancy observations. The frontend maps detector results to the
configured parking spaces and exposes per-space state and confidence
information. Polling can be enabled for continued status retrieval.

A detector freshness indicator makes it clear when the latest
observation has become old. The implemented stale-data rule uses an age
threshold of more than 15 seconds.

### 4.2 History

The history feature provides access to stored snapshots rather than only
the current status. Filtering and layout context make the records easier
to inspect. For observations recorded after layout-context support was
introduced, the system can identify the active layout associated with
the observation. Older records may not contain enough information to
reconstruct historical layout identity reliably.

### 4.3 Analytics

Analytics are based on stored occupancy snapshots.

For one non-empty snapshot, occupancy is calculated as:

**Occupancy rate = 100 × occupied spaces / valid reported spaces**

The average occupancy rate is the arithmetic mean of the non-empty
snapshot occupancy rates in the selected data. Minimum and maximum
values are calculated from these snapshot rates. Peak occupancy selects
the highest rate, using the latest observation when multiple
observations tie for the peak.

Per-space utilization is observation-based:

**Space utilization = 100 × occupied observations for the space /
observations containing that space**

This value represents how frequently a space was observed as occupied in
the available samples. It is not duration-based utilization and must not
be interpreted as a vehicle count or arrival rate.

### 4.4 Operational Alerts

Alerts are derived deterministically from stored observations. Polling
the alerts endpoint does not create duplicate alert records. Only alert
settings need to be persisted for these derived conditions.

The implemented default rules include:

-   high occupancy at or above 80%, reported as Critical;
-   low detector confidence below 0.70, reported as Warning;
-   detector data older than 15 seconds, reported as Warning;
-   state changes between consecutive compatible recorded layouts,
    reported as Info; and
-   browser-detected backend unavailability, reported as Critical.

The interface also exposes recent recorded state-change events
independently of the active-alert filter. These events describe
differences in observed states; they do not assert that a vehicle
arrived or departed.

### 4.5 Owner Setup and Layout Handoff

The Owner Setup workflow allows the parking layout to be published to
the backend. For demonstration purposes, the sample handoff verifies the
saved layout and then opens Live Parking with polling initially paused.
This helps make the relationship between layout configuration, detector
processing, backend state, and frontend visualization explicit.

## 5. Demo and Results

A reproducible demonstration is documented in `docs/DEMO_GUIDE.md`. The
intended demonstration uses the repository's existing sample images and
the actual detector/backend path rather than generated occupancy values.

A typical demonstration proceeds by starting the backend and frontend,
publishing or confirming the 12-space sample layout in Owner Setup,
running the edge detector on a sample frame, and then inspecting the
resulting observation in Live Parking, Dashboard, History, Analytics,
and Alerts.

During end-to-end validation, several sample frames produced concrete
observable changes:

-   One tested frame produced all 12 monitored spaces as free. The
    management interface consequently displayed 12 available and 0
    occupied spaces.
-   A later frame produced 11 free and 1 occupied space, corresponding
    to an 8.3% snapshot occupancy rate. The observation was also shown
    with its layout identity.
-   Another frame produced 8 free and 4 occupied spaces, corresponding
    to a 33.3% snapshot occupancy rate. Comparison with the preceding
    compatible observation exposed several recorded state changes.
-   Low-confidence and stale-data conditions were also surfaced by the
    alert system when their configured rules were met.

These results demonstrate the complete data path: an input image is
processed by the edge model, the observation is transferred to FastAPI
and persisted, and the frontend retrieves and displays the resulting
state. They are functional demonstration results, not a statistical
evaluation of model accuracy.

## 6. Testing and Validation

The project was tested incrementally while the management functionality
was developed. Automated tests cover backend behavior and frontend
components, including analytics calculations, alerts, management
behavior, occupancy handling, and observation semantics.

The final repository CI run after the formatting correction completed
successfully for both the Python and frontend jobs. The frontend test
suite reported 65 passing tests. Earlier validation of the completed
alert/state-change functionality included 50 backend tests. Linting,
formatting checks, and production frontend builds were also used during
development.

End-to-end validation was additionally performed with the repository's
sample parking images. This was important because unit tests alone do
not prove that the detector, backend, persistence layer, polling
behavior, and management interface are correctly connected.

## 7. Limitations

The current system has several important limitations.

First, the project uses an existing model and model weights; this
project did not conduct a new controlled accuracy study. The
demonstrated detections therefore should not be interpreted as a new
accuracy benchmark.

Second, the analytics are observation-based. Per-space utilization
measures the fraction of observations in which a space is occupied, not
the amount of clock time for which it was occupied. Similarly, state
changes do not establish vehicle arrivals or departures.

Third, historical layout identity is limited by the information stored
at the time of each observation. Older records created before
detector-context support cannot always be associated reliably with a
historical layout.

Fourth, analytics operate on a bounded set of dated observations in the
current implementation, and aggregation is performed from the
observation log. A larger production deployment could benefit from more
scalable aggregation and storage strategies.

Finally, this project demonstrates a functional smart-parking management
system but does not claim production deployment readiness. Real
deployment would require broader operational testing, security review,
monitoring, and evaluation under varied camera, lighting, weather, and
parking-layout conditions.

## 8. Conclusions

ParkVision AI demonstrates how computer-vision parking observations can
be extended into a practical management workflow. The completed project
connects an existing edge occupancy detector to a FastAPI and SQLite
backend and a React management interface that supports live status,
history, analytics, alerts, layout setup, and system documentation.

A central design goal was to keep the management layer faithful to the
data it receives. The system avoids interpreting missing observations as
free spaces, avoids presenting model confidence as calibrated
probability, and avoids converting state changes into unsupported
arrival/departure claims. This makes the dashboard more useful while
preserving the limitations of snapshot-based observations.

Future work could include duration-aware utilization, more scalable
aggregation, stronger deployment/security tooling, broader model
evaluation, richer notification channels, and testing with additional
real-world parking environments.

## 9. Contribution Scope and Documentation

The team's implemented work includes the management/dashboard experience,
history and analytics, operational alerting, related backend support, testing,
documentation, and demonstration improvements described in this report. The
computer-vision pipeline and existing model assets are integrated components,
not claimed as newly created by the team. Applicable source copyright and model
licensing notices remain in the repository's license files.

### Repository documentation

-   `README.md` --- project overview, setup, architecture, licensing,
    and license information.
-   `docs/DEMO_GUIDE.md` --- reproducible demonstration workflow.
-   `backend/README.md` --- backend-specific documentation.

------------------------------------------------------------------------

**Project:** ParkVision AI\
**Team:** Amna Jabarin, Mohammad Ziyadat, and Fihmi Sbeih

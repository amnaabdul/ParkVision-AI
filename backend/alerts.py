"""Deterministic snapshot alerts. Settings persist; alert feed is derived on read."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, Field

from backend.analytics import instant, load_observations, sort_key, unique_rows

SEVERITIES = {
    "high_occupancy": "Critical",
    "detector_stale": "Warning",
    "low_confidence": "Warning",
    "state_change": "Info",
}
SEVERITY_ORDER = {"Critical": 0, "Warning": 1, "Info": 2}


class AlertSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")
    high_occupancy_percent: float = Field(
        default=80, ge=1, le=100, strict=True, allow_inf_nan=False
    )
    low_confidence_percent: float = Field(
        default=70, ge=0, le=100, strict=True, allow_inf_nan=False
    )
    detector_stale_seconds: float = Field(
        default=15, gt=0, strict=True, allow_inf_nan=False
    )


def initialize_alert_settings(conn):
    conn.execute(
        """CREATE TABLE IF NOT EXISTS alert_settings (
        id INTEGER PRIMARY KEY CHECK (id=1),
        high_occupancy_percent REAL NOT NULL CHECK (high_occupancy_percent BETWEEN 1 AND 100),
        low_confidence_percent REAL NOT NULL CHECK (low_confidence_percent BETWEEN 0 AND 100),
        detector_stale_seconds REAL NOT NULL CHECK (detector_stale_seconds > 0),
        updated_at TEXT NOT NULL
    )"""
    )
    conn.execute(
        "INSERT OR IGNORE INTO alert_settings VALUES (1,80,70,15,?)",
        (datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),),
    )


def read_settings(conn):
    row = conn.execute(
        "SELECT high_occupancy_percent,low_confidence_percent,detector_stale_seconds,updated_at FROM alert_settings WHERE id=1"
    ).fetchone()
    return {
        "high_occupancy_percent": row[0],
        "low_confidence_percent": row[1],
        "detector_stale_seconds": row[2],
        "updated_at": row[3],
    }


def save_settings(conn, settings):
    conn.execute(
        "UPDATE alert_settings SET high_occupancy_percent=?,low_confidence_percent=?,detector_stale_seconds=?,updated_at=? WHERE id=1",
        (
            settings.high_occupancy_percent,
            settings.low_confidence_percent,
            settings.detector_stale_seconds,
            datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        ),
    )
    conn.commit()
    return read_settings(conn)


def detector_state(row, now, stale_seconds):
    if not row or not row["total_observed"]:
        return "No data"
    timestamp = instant(row["timestamp"])
    if timestamp is None or timestamp > now + 5:
        return "Unknown freshness"
    return "Stale" if now - timestamp > stale_seconds else "Live"


def anchor(row):
    # Exclude labels and receipt time so exact payload replays remain one event.
    spaces = [
        {key: spot[key] for key in ("spot_id", "status", "confidence")}
        for spot in row["spaces"]
    ]
    value = [row["cohort"], instant(row["timestamp"]) or row["timestamp"], spaces]
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()[:20]


def event(kind, row, message, active, spot=None, previous=None, event_time=None):
    identity = [
        kind,
        anchor(row),
        spot["spot_id"] if spot else None,
        anchor(previous) if previous else None,
    ]
    digest = hashlib.sha256(json.dumps(identity).encode()).hexdigest()[:20]
    return {
        "id": f"{kind}:{digest}",
        "type": kind,
        "severity": SEVERITIES[kind],
        "message": message,
        "active": active,
        "source": "detector",
        "observation_id": row["id"],
        "observation_timestamp": row["timestamp"],
        "recorded_at": row["recorded_at"],
        "event_time": event_time or row["timestamp"],
        "layout_id": row["layout_id"],
        "cohort": row["cohort"],
        "layout_status": row["layout_status"],
        "spot_id": spot["spot_id"] if spot else None,
        "spot_label": spot["label"] if spot else None,
        "confidence": spot["confidence"] if spot else None,
        "previous_status": None,
        "current_status": spot["status"] if spot else None,
    }


def derive_alerts(rows, settings, now):
    latest = rows[0] if rows else None  # Same latest receipt semantics as /status.
    state = detector_state(latest, now, settings["detector_stale_seconds"])
    alerts = []
    distinct = unique_rows(rows)
    chronological = sorted(distinct, key=sort_key)
    for row in distinct:
        active = latest is not None and row["id"] == latest["id"]
        timestamp = instant(row["timestamp"])
        if timestamp is not None and timestamp > now + 5:
            continue  # Future-dated observations have unknown freshness, not live conditions.
        stale_note = (
            " Based on the latest stale observation."
            if active and state == "Stale"
            else ""
        )
        rate = row["occupancy_rate"]
        if rate is not None and rate >= settings["high_occupancy_percent"]:
            alert = event(
                "high_occupancy",
                row,
                f"High occupancy: {row['occupied']} of {row['total_observed']} reported spaces occupied ({rate:.1f}%)."
                + stale_note,
                active,
            )
            alert.update(
                {
                    "occupied": row["occupied"],
                    "total_observed": row["total_observed"],
                    "occupancy_rate": rate,
                }
            )
            alerts.append(alert)
        for spot in row["spaces"]:
            score = spot["confidence"]
            if (
                score is not None
                and 0 <= score <= 1
                and score * 100 < settings["low_confidence_percent"]
            ):
                alerts.append(
                    event(
                        "low_confidence",
                        row,
                        f"{spot['label']} low model confidence: {score*100:.1f}%."
                        + stale_note,
                        active,
                        spot,
                    )
                )
    if state == "Stale":
        onset = (
            datetime.fromtimestamp(
                instant(latest["timestamp"]) + settings["detector_stale_seconds"],
                timezone.utc,
            )
            .isoformat()
            .replace("+00:00", "Z")
        )
        alerts.append(
            event(
                "detector_stale",
                latest,
                f"Detector observation is stale: {now-instant(latest['timestamp']):.0f}s old; threshold {settings['detector_stale_seconds']:g}s.",
                True,
                event_time=onset,
            )
        )
    changes_skipped = 0
    for previous, row in zip(chronological, chronological[1:]):
        # Identical recorded layout IDs are required. Legacy matching ID sets
        # alone cannot establish camera geometry identity, so skip them.
        before, after = instant(previous["timestamp"]), instant(row["timestamp"])
        if previous["layout_id"] is None or row["layout_id"] is None:
            changes_skipped += 1
            continue
        if (
            previous["layout_id"] != row["layout_id"]
            or before is None
            or after is None
            or after <= before
            or after > now + 5
            or previous["unmapped_spots"]
            or row["unmapped_spots"]
        ):
            continue
        old = {spot["spot_id"]: spot for spot in previous["spaces"]}
        for spot in row["spaces"]:
            earlier = old.get(spot["spot_id"])
            if earlier and earlier["status"] != spot["status"]:
                label = {"free": "Available", "occupied": "Occupied"}
                alert = event(
                    "state_change",
                    row,
                    f"{spot['label']} state change: {label[earlier['status']]} to {label[spot['status']]}. Observed states, not a vehicle arrival or departure.",
                    False,
                    spot,
                    previous,
                )
                alert["previous_status"] = earlier["status"]
                alerts.append(alert)
    return alerts, state, changes_skipped


def alert_feed(
    conn, severity=None, kind=None, active_only=False, limit=100, offset=0, now=None
):
    checked = now if now is not None else datetime.now(timezone.utc).timestamp()
    settings = read_settings(conn)
    rows = load_observations(conn)
    alerts, state, skipped = derive_alerts(rows, settings, checked)
    active = [item for item in alerts if item["active"]]
    latest = (
        max(alerts, key=lambda item: instant(item["event_time"]) or 0)
        if alerts
        else None
    )
    summary = {
        "active": len(active),
        "critical": sum(item["severity"] == "Critical" for item in active),
        "warnings": sum(item["severity"] == "Warning" for item in active),
        "latest_alert": latest,
    }
    selected = [
        item
        for item in alerts
        if (not severity or item["severity"] == severity)
        and (not kind or item["type"] == kind)
        and (not active_only or item["active"])
    ]
    selected.sort(
        key=lambda item: (
            not item["active"],
            SEVERITY_ORDER[item["severity"]],
            -(instant(item["event_time"]) or 0),
            item["id"],
        )
    )
    return {
        "items": selected[offset : offset + limit],
        "total": len(selected),
        "limit": limit,
        "offset": offset,
        "summary": summary,
        "settings": settings,
        "detector_state": state,
        "evaluated_at": datetime.fromtimestamp(checked, timezone.utc)
        .isoformat()
        .replace("+00:00", "Z"),
        "quality": {
            "observations": len(rows),
            "legacy_transition_pairs_skipped": skipped,
            "latest_missing_confidence": (
                sum(
                    spot["confidence"] is None or not 0 <= spot["confidence"] <= 1
                    for spot in rows[0]["spaces"]
                )
                if rows
                else 0
            ),
        },
        "method": "Derived on read from real snapshots; active conditions describe the latest received observation; historical conditions/state changes are recorded events, not resolved or acknowledged incidents.",
    }

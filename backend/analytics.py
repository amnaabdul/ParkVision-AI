"""Read-only snapshot analytics. No sessions, arrival estimates or duration claims."""

from __future__ import annotations

import hashlib
import json
import math
from collections import defaultdict
from datetime import datetime, timezone

from fastapi import HTTPException


def instant(value):
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed.timestamp() if parsed.tzinfo is not None else None
    except (AttributeError, TypeError, ValueError):
        return None


def validate_range(start, end):
    if any(value is not None and value.tzinfo is None for value in (start, end)):
        raise HTTPException(422, "Date filters must include a timezone offset or Z.")
    if start and end and start > end:
        raise HTTPException(422, "Start must be before end.")


def load_observations(conn):
    rows = conn.execute(
        """SELECT l.id, l.payload, l.recorded, c.layout_id, c.layout_data
           FROM log l LEFT JOIN detector_context c ON c.log_id=l.id
           ORDER BY l.id DESC"""
    ).fetchall()
    observations = []
    for log_id, raw, recorded, layout_id, layout_json in rows:
        try:
            payload = json.loads(raw)
            layout = json.loads(layout_json) if layout_json else {}
        except (ValueError, TypeError):
            continue
        if not isinstance(payload, dict) or not isinstance(layout, dict):
            continue
        source_spots = payload.get("spots")
        source_spots = source_spots if isinstance(source_spots, dict) else {}
        states = {
            key: value
            for key, value in source_spots.items()
            if value in ("free", "occupied")
        }
        labels = {
            spot["spot_id"]: spot.get("label")
            for spot in layout.get("spots", [])
            if isinstance(spot, dict) and "spot_id" in spot
        }
        confidence = payload.get("confidence")
        confidence = confidence if isinstance(confidence, dict) else {}
        spaces = []
        for spot_id, status in sorted(states.items()):
            score = confidence.get(spot_id)
            if (
                not isinstance(score, (float, int))
                or isinstance(score, bool)
                or not math.isfinite(score)
            ):
                score = None
            spaces.append(
                {
                    "spot_id": spot_id,
                    "label": labels.get(spot_id)
                    or ("P" + spot_id[5:] if spot_id.startswith("spot_") else spot_id),
                    "status": status,
                    "confidence": score,
                }
            )
        total = len(states)
        occupied = sum(value == "occupied" for value in states.values())
        signature = hashlib.sha256(json.dumps(sorted(states)).encode()).hexdigest()[:12]
        cohort = (
            f"layout:{layout_id}" if layout_id is not None else f"legacy:{signature}"
        )
        observations.append(
            {
                "id": log_id,
                "timestamp": payload.get("timestamp"),
                "recorded_at": recorded,
                "source": "detector",
                "layout_id": layout_id,
                "cohort": cohort,
                "layout_status": "recorded" if layout_id is not None else "unrecorded",
                "total_observed": total,
                "available": total - occupied,
                "occupied": occupied,
                "occupancy_rate": occupied / total * 100 if total else None,
                "missing_layout_spots": (
                    len(set(labels) - set(states)) if layout_id is not None else None
                ),
                "unmapped_spots": (
                    len(set(states) - set(labels)) if layout_id is not None else None
                ),
                "spaces": spaces,
            }
        )
    return observations


def sort_key(row):
    time = instant(row["timestamp"])
    return (time if time is not None else instant(row["recorded_at"]) or 0, row["id"])


def select_rows(rows, start, end, cohort):
    validate_range(start, end)
    valid_cohorts = {row["cohort"] for row in rows}
    if cohort != "all" and cohort not in valid_cohorts:
        raise HTTPException(422, "Unknown layout cohort. Refresh the layout choices.")
    result = []
    for row in rows:
        if cohort != "all" and row["cohort"] != cohort:
            continue
        time = instant(row["timestamp"])
        if (start or end) and time is None:
            continue
        if start and time < start.timestamp():
            continue
        if end and time > end.timestamp():
            continue
        result.append(row)
    return result


def cohort_choices(rows):
    choices = {}
    for row in rows:
        choices.setdefault(
            row["cohort"],
            {
                "id": row["cohort"],
                "label": (
                    f"Layout #{row['layout_id']}"
                    if row["layout_id"] is not None
                    else f"Layout unrecorded ({row['total_observed']} reported IDs)"
                ),
                "layout_id": row["layout_id"],
            },
        )
    return list(choices.values())


def unique_rows(rows):
    seen = set()
    distinct = []
    for row in rows:  # Newest receipt wins for exact duplicate detector payloads.
        time = instant(row["timestamp"])
        detector_spaces = [
            {key: spot[key] for key in ("spot_id", "status", "confidence")}
            for spot in row["spaces"]
        ]
        key = (row["cohort"], time, json.dumps(detector_spaces, sort_keys=True))
        if time is not None and key in seen:
            continue
        seen.add(key)
        distinct.append(row)
    return distinct


def management_history(
    conn, start=None, end=None, cohort="all", state="all", limit=50, offset=0
):
    all_rows = load_observations(conn)
    rows = select_rows(all_rows, start, end, cohort)
    if state != "all":
        rows = [
            row
            for row in rows
            if any(spot["status"] == state for spot in row["spaces"])
        ]
    rows.sort(key=sort_key, reverse=True)
    return {
        "items": rows[offset : offset + limit],
        "total": len(rows),
        "limit": limit,
        "offset": offset,
        "cohorts": cohort_choices(all_rows),
    }


def management_summary(conn, start=None, end=None, cohort="all"):
    all_rows = load_observations(conn)
    filtered = select_rows(all_rows, start, end, cohort)
    rows = unique_rows(filtered)
    rows.sort(key=sort_key)
    rates = [row for row in rows if row["occupancy_rate"] is not None]
    peak = (
        max(rates, key=lambda row: (row["occupancy_rate"], sort_key(row)))
        if rates
        else None
    )
    per_space = defaultdict(lambda: {"observed": 0, "occupied": 0, "available": 0})
    for row in rows:
        for spot in row["spaces"]:
            entry = per_space[(row["cohort"], spot["spot_id"])]
            entry.update(
                {
                    "cohort": row["cohort"],
                    "layout_id": row["layout_id"],
                    "spot_id": spot["spot_id"],
                    "label": spot["label"],
                }
            )
            entry["observed"] += 1
            entry["occupied"] += spot["status"] == "occupied"
            entry["available"] += spot["status"] == "free"
    spots = [
        {**entry, "utilization_rate": entry["occupied"] / entry["observed"] * 100}
        for entry in per_space.values()
    ]
    spots.sort(
        key=lambda entry: (
            -entry["utilization_rate"],
            entry["cohort"],
            entry["spot_id"],
        )
    )
    current = (
        all_rows[0] if all_rows else None
    )  # Same latest receipt semantics as /status.
    time = instant(current["timestamp"]) if current else None
    age = datetime.now(timezone.utc).timestamp() - time if time is not None else None
    status = (
        "No data"
        if not current or not current["total_observed"]
        else (
            "Unknown freshness"
            if age is None or age < -5
            else "Stale" if age > 15 else "Live"
        )
    )
    trend = [
        {key: value for key, value in row.items() if key != "spaces"}
        for row in rows
        if instant(row["timestamp"]) is not None
    ][-1000:]
    return {
        "summary": {
            "observations": len(rows),
            "received_observations": len(filtered),
            "duplicate_observations": len(filtered) - len(rows),
            "usable_observations": len(rates),
            "average_occupancy_rate": (
                sum(row["occupancy_rate"] for row in rates) / len(rates)
                if rates
                else None
            ),
            "max_occupancy_rate": peak["occupancy_rate"] if peak else None,
            "min_occupancy_rate": (
                min(row["occupancy_rate"] for row in rates) if rates else None
            ),
            "peak_timestamp": peak["timestamp"] if peak else None,
            "peak_recorded_at": peak["recorded_at"] if peak else None,
        },
        "current": current,
        "current_freshness": status,
        "trend": trend,
        "spots": spots,
        "cohorts": cohort_choices(all_rows),
        "quality": {
            "mixed_layouts": len({row["cohort"] for row in rows}) > 1,
            "unrecorded_layout_observations": sum(
                row["layout_id"] is None for row in rows
            ),
            "missing_timestamp_observations": sum(
                instant(row["timestamp"]) is None for row in rows
            ),
            "partial_observations": sum(
                (row["missing_layout_spots"] or 0) > 0 for row in rows
            ),
            "trend_limit": 1000,
            "trend_truncated": sum(
                instant(row["timestamp"]) is not None for row in rows
            )
            > 1000,
        },
        "method": "observation-based; exact timestamped duplicate payloads excluded; no duration or arrival estimates",
    }

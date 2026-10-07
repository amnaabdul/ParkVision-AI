import json
import sqlite3

import pytest
from fastapi.testclient import TestClient

import backend.main as backend


@pytest.fixture
def client(monkeypatch):
    conn = sqlite3.connect(":memory:", check_same_thread=False)
    backend.init_db(conn)
    monkeypatch.setattr(backend, "_conn", conn)
    monkeypatch.setattr(backend, "AUTH_ENABLED", False)
    with TestClient(backend.app) as client:
        yield client
    conn.close()


def post(client, spots, timestamp="2026-10-05T12:00:00Z", confidence=None):
    payload = {"spots": spots, "timestamp": timestamp}
    if confidence is not None:
        payload["confidence"] = confidence
    assert client.post("/update", json=payload).status_code == 200


def layout(client, label="P1", other=True):
    spots = [
        {
            "spot_id": "spot_1",
            "label": label,
            "corners": [[0, 0], [10, 0], [10, 10], [0, 10]],
        }
    ]
    if other:
        spots.append(
            {
                "spot_id": "spot_2",
                "label": "P2",
                "corners": [[20, 0], [30, 0], [30, 10], [20, 10]],
            }
        )
    assert client.post("/map", json={"spots": spots}).status_code == 200


def test_empty_analytics_and_history(client):
    data = client.get("/analytics/summary").json()
    assert data["summary"]["observations"] == 0
    assert data["summary"]["average_occupancy_rate"] is None
    assert data["trend"] == data["spots"] == []
    assert data["current"] is None
    assert data["current_freshness"] == "No data"
    assert client.get("/analytics/history").json()["items"] == []


def test_single_observation_and_labels(client):
    layout(client)
    post(client, {"spot_1": "occupied", "spot_2": "free"})
    data = client.get("/analytics/summary").json()
    assert data["summary"]["average_occupancy_rate"] == 50
    assert data["summary"]["max_occupancy_rate"] == 50
    assert data["summary"]["min_occupancy_rate"] == 50
    assert len(data["trend"]) == 1
    occupied = next(s for s in data["spots"] if s["spot_id"] == "spot_1")
    assert occupied["label"] == "P1"
    assert occupied["utilization_rate"] == 100
    assert data["current"]["spaces"][0]["confidence"] is None
    assert data["current_freshness"] == "Stale"
    assert data["quality"]["unrecorded_layout_observations"] == 0


def test_multiple_snapshots_dedup_and_per_space_denominators(client):
    layout(client)
    post(client, {"spot_1": "occupied", "spot_2": "free"})
    post(client, {"spot_1": "occupied", "spot_2": "free"})  # Exact replay.
    post(client, {"spot_1": "occupied", "spot_2": "occupied"}, "2026-10-05T12:00:01Z")
    post(client, {"spot_1": "free"}, "2026-10-05T12:00:02Z")
    data = client.get("/analytics/summary").json()
    stats = data["summary"]
    assert stats["observations"] == 3
    assert stats["received_observations"] == 4
    assert stats["duplicate_observations"] == 1
    assert stats["average_occupancy_rate"] == 50  # mean(50, 100, 0)
    assert stats["min_occupancy_rate"] == 0
    assert stats["max_occupancy_rate"] == 100
    assert stats["peak_timestamp"] == "2026-10-05T12:00:01Z"
    per = {s["spot_id"]: s for s in data["spots"]}
    assert per["spot_1"]["observed"] == 3
    assert per["spot_1"]["occupied"] == 2
    assert per["spot_1"]["utilization_rate"] == pytest.approx(200 / 3)
    assert per["spot_2"]["observed"] == 2  # Missing does not mean free.
    assert per["spot_2"]["utilization_rate"] == 50
    assert data["quality"]["partial_observations"] == 1
    assert client.get("/analytics/history").json()["total"] == 4
    assert client.get("/sessions").json()["count"] == 7  # Never used as arrivals.


def test_history_filters_order_pagination_and_timestamps(client):
    post(client, {"spot_1": "occupied"}, "2026-10-05T12:00:02Z")
    post(client, {"spot_1": "free"}, "2026-10-05T12:00:00Z")
    data = client.get("/analytics/history", params={"limit": 1}).json()
    assert data["total"] == 2
    assert data["items"][0]["timestamp"] == "2026-10-05T12:00:02Z"
    assert data["items"][0]["recorded_at"]
    assert (
        client.get("/analytics/history", params={"state": "free"}).json()["total"] == 1
    )
    assert (
        client.get("/analytics/history", params={"offset": 1}).json()["items"][0][
            "available"
        ]
        == 1
    )
    params = {"start": "2026-10-05T15:00:01+03:00", "end": "2026-10-05T15:00:02+03:00"}
    assert client.get("/analytics/history", params=params).json()["total"] == 1
    assert (
        client.get("/analytics/summary", params=params).json()["summary"][
            "observations"
        ]
        == 1
    )
    assert (
        client.get(
            "/analytics/history", params={"start": "2026-10-05T12:00:00"}
        ).status_code
        == 422
    )
    assert client.get("/analytics/history", params={"limit": -1}).status_code == 422
    assert (
        client.get("/analytics/summary", params={"cohort": "invalid"}).status_code
        == 422
    )
    assert (
        client.get(
            "/analytics/summary",
            params={"start": "2026-10-06T00:00:00Z", "end": "2026-10-05T00:00:00Z"},
        ).status_code
        == 422
    )


def test_layout_changes_do_not_merge_reused_spot_ids(client):
    layout(client, "Old")
    post(client, {"spot_1": "occupied"})
    layout(client, "New", other=False)
    post(client, {"spot_1": "free"}, "2026-10-05T12:00:01Z")
    data = client.get("/analytics/summary").json()
    assert data["quality"]["mixed_layouts"]
    assert len(data["spots"]) == 2
    assert {s["label"]: s["utilization_rate"] for s in data["spots"]} == {
        "Old": 100,
        "New": 0,
    }
    cohort = data["cohorts"][0]["id"]
    scoped = client.get("/analytics/summary", params={"cohort": cohort}).json()
    assert scoped["summary"]["observations"] == 1
    assert not scoped["quality"]["mixed_layouts"]


def test_legacy_context_is_unknown_and_not_backfilled(client):
    conn = backend.get_conn()
    for spots in ({"spot_1": "occupied"}, {"spot_1": "free", "spot_2": "free"}):
        conn.execute(
            "INSERT INTO log (payload,recorded) VALUES (?,?)",
            (
                json.dumps({"spots": spots, "timestamp": "2026-10-05T12:00:00Z"}),
                "2026-10-05T12:00:01Z",
            ),
        )
    conn.commit()
    layout(client)
    data = client.get("/analytics/summary").json()
    assert data["quality"]["unrecorded_layout_observations"] == 2
    assert len(data["cohorts"]) == 2  # Distinct reported ID sets remain separate.
    assert data["current"]["layout_id"] is None


def test_missing_spots_and_invalid_timestamp_are_not_fabricated(client):
    post(client, {}, "bad-timestamp")
    data = client.get("/analytics/summary").json()
    assert data["summary"]["observations"] == 1
    assert data["summary"]["usable_observations"] == 0
    assert data["summary"]["average_occupancy_rate"] is None
    assert data["trend"] == []
    assert data["current"]["occupancy_rate"] is None
    assert data["quality"]["missing_timestamp_observations"] == 1
    assert client.get("/analytics/history").json()["total"] == 1
    assert (
        client.get(
            "/analytics/history", params={"start": "2026-10-05T00:00:00Z"}
        ).json()["total"]
        == 0
    )


def test_existing_history_and_status_contracts_unchanged(client):
    post(client, {"spot_1": "free"})
    assert set(client.get("/history").json()) == {"items"}
    assert set(client.get("/history").json()["items"][0]) == {"payload", "recorded_at"}
    assert set(client.get("/status").json()) == {"spots", "timestamp", "confidence"}
    assert set(client.get("/sessions").json()) == {"sessions", "count"}


def test_layout_labels_are_captured_and_sessions_are_not_analytics(client):
    layout(client, "Original")
    post(client, {"spot_1": "occupied"})
    assert client.patch("/spots/spot_1", json={"label": "Renamed"}).status_code == 200
    conn = backend.get_conn()
    conn.execute(
        "INSERT INTO park_sessions (spot_id,status,confidence,recorded_at) VALUES ('spot_1','occupied',0.8,'2026-10-05T12:00:02Z')"
    )
    conn.commit()
    backend.init_db(conn)  # Migration is idempotent and preserves recorded context.
    data = client.get("/analytics/summary").json()
    assert data["summary"]["observations"] == 1
    assert data["spots"][0]["label"] == "Original"
    assert client.get("/map").json()["spots"][0]["label"] == "Renamed"


def test_duplicate_offsets_and_current_independent_of_history_filters(client):
    layout(client)
    post(client, {"spot_1": "occupied"}, "2026-10-05T12:00:00Z")
    post(client, {"spot_1": "occupied"}, "2026-10-05T15:00:00+03:00")
    post(client, {"spot_1": "free"}, "2026-10-06T12:00:00Z")
    data = client.get(
        "/analytics/summary", params={"end": "2026-10-05T23:59:59Z"}
    ).json()
    assert data["summary"]["observations"] == 1
    assert data["summary"]["duplicate_observations"] == 1
    assert data["summary"]["average_occupancy_rate"] == 100
    assert data["current"]["occupancy_rate"] == 0
    assert data["current"]["timestamp"] == "2026-10-06T12:00:00Z"


def test_label_correction_does_not_turn_a_replay_into_an_observation(client):
    layout(client, "Before")
    post(client, {"spot_1": "occupied"})
    client.patch("/spots/spot_1", json={"label": "After"})
    post(client, {"spot_1": "occupied"})
    data = client.get("/analytics/summary").json()
    assert data["summary"]["observations"] == 1
    assert data["summary"]["duplicate_observations"] == 1
    history = client.get("/analytics/history").json()["items"]
    assert [row["spaces"][0]["label"] for row in history] == ["After", "Before"]

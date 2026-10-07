import sqlite3
import pytest
from fastapi.testclient import TestClient
import backend.main as backend
from backend.alerts import alert_feed, read_settings
from backend.analytics import instant


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
    payload = dict(spots=spots, timestamp=timestamp)
    if confidence is not None:
        payload["confidence"] = confidence
    assert client.post("/update", json=payload).status_code == 200


def layout(client, label="P1"):
    assert (
        client.post(
            "/map",
            json={
                "spots": [
                    {
                        "spot_id": "spot_1",
                        "label": label,
                        "corners": [[0, 0], [10, 0], [10, 10], [0, 10]],
                    }
                ]
            },
        ).status_code
        == 200
    )


def feed(seconds=0):
    return alert_feed(backend.get_conn(), now=instant("2026-10-05T12:00:00Z") + seconds)


def test_empty(client):
    assert feed()["items"] == []
    assert feed()["detector_state"] == "No data"
    assert feed()["summary"]["active"] == 0


def test_high_and_low_confidence_thresholds(client):
    post(
        client,
        {"spot_1": "occupied", "spot_2": "free"},
        confidence={"spot_1": 0.528, "spot_2": 0.70},
    )
    items = feed()["items"]
    assert [x["type"] for x in items] == ["low_confidence"]
    assert items[0]["spot_label"] == "P1"
    assert items[0]["confidence"] == 0.528
    post(client, {"spot_1": "occupied"})
    assert any(x["type"] == "high_occupancy" and x["active"] for x in feed()["items"])
    assert feed()["quality"]["latest_missing_confidence"] == 1


def test_occupancy_equal_threshold_and_missing_spaces(client):
    post(client, {f"spot_{i}": "occupied" if i < 4 else "free" for i in range(5)})
    alert = feed()["items"][0]
    assert alert["occupancy_rate"] == 80
    assert alert["total_observed"] == 5


def test_staleness_uses_detector_not_receipt(client):
    post(client, {"spot_1": "free"})
    assert feed(15)["items"] == []
    assert feed(15)["detector_state"] == "Live"
    assert feed(15.001)["items"][0]["type"] == "detector_stale"
    assert feed(16)["items"][0]["event_time"] == "2026-10-05T12:00:15Z"


def test_settings_validation_persistence(client):
    values = dict(
        high_occupancy_percent=90, low_confidence_percent=50, detector_stale_seconds=30
    )
    assert client.put("/alerts/settings", json=values).status_code == 200
    backend.init_db(backend.get_conn())
    assert read_settings(backend.get_conn())["high_occupancy_percent"] == 90
    for field, value in [
        ("high_occupancy_percent", 0),
        ("high_occupancy_percent", 101),
        ("low_confidence_percent", -1),
        ("low_confidence_percent", 101),
        ("detector_stale_seconds", 0),
        ("detector_stale_seconds", -1),
        ("low_confidence_percent", True),
        ("detector_stale_seconds", "15"),
    ]:
        assert (
            client.put("/alerts/settings", json={**values, field: value}).status_code
            == 422
        )
    post(client, {"spot_1": "free"}, confidence={"spot_1": 0.6})
    assert feed(20)["items"] == []


def test_auth_settings(client, monkeypatch):
    monkeypatch.setattr(backend, "AUTH_ENABLED", True)
    assert client.put("/alerts/settings", json={}).status_code in (401, 403)
    assert client.get("/alerts/settings").status_code == 200


def test_compatible_transitions_and_duplicates(client):
    layout(client)
    post(client, {"spot_1": "free"})
    post(client, {"spot_1": "occupied"}, "2026-10-05T12:00:01Z")
    first = feed(2)
    change = next(x for x in first["items"] if x["type"] == "state_change")
    assert change["previous_status"] == "free"
    assert change["layout_id"] == 1
    assert change["severity"] == "Info" and not change["active"]
    post(client, {"spot_1": "occupied"}, "2026-10-05T12:00:01Z")
    second = feed(2)
    assert [x["id"] for x in first["items"]] == [x["id"] for x in second["items"]]
    assert second["summary"]["active"] == 1


def test_layout_changes_and_legacy_skipped(client):
    post(client, {"spot_1": "free"})
    post(client, {"spot_1": "occupied"}, "2026-10-05T12:00:01Z")
    layout(client)
    post(client, {"spot_1": "free"}, "2026-10-05T12:00:02Z")
    layout(client, "New label")
    post(client, {"spot_1": "occupied"}, "2026-10-05T12:00:03Z")
    assert not any(x["type"] == "state_change" for x in feed(4)["items"])
    assert feed(4)["quality"]["legacy_transition_pairs_skipped"] == 2


def test_missing_spots_not_state_changes(client):
    layout(client)
    post(client, {"spot_1": "free"})
    post(client, {}, "2026-10-05T12:00:01Z")
    assert feed(2)["items"] == []


def test_future_time_not_stale_or_fresh(client):
    post(client, {"spot_1": "occupied"}, "2026-10-05T13:00:00Z")
    assert feed()["detector_state"] == "Unknown freshness"
    assert feed()["items"] == []


def test_api_filters_and_pagination(client):
    post(client, {"spot_1": "occupied"}, confidence={"spot_1": 0.5})
    response = client.get(
        "/alerts", params={"severity": "Warning", "active_only": True, "limit": 1}
    ).json()
    assert len(response["items"]) == 1 and response["total"] == 2
    assert response["summary"]["critical"] == 1
    assert (
        client.get("/alerts", params={"type": "low_confidence"}).json()["items"][0][
            "spot_id"
        ]
        == "spot_1"
    )
    assert client.get("/alerts", params={"severity": "bogus"}).status_code == 422


def test_utc_offset_equivalence_and_invalid_confidence(client):
    post(
        client,
        {"spot_1": "free", "spot_2": "free"},
        timestamp="2026-10-05T15:00:00+03:00",
        confidence={"spot_1": 1.2, "spot_2": 0.70},
    )
    assert feed(15)["detector_state"] == "Live"
    assert feed(15)["items"] == []
    assert feed(16)["items"][0]["type"] == "detector_stale"
    assert feed()["quality"]["latest_missing_confidence"] == 1


def test_settings_survive_database_reopen(tmp_path):
    from backend.alerts import AlertSettings, initialize_alert_settings, save_settings

    path = tmp_path / "settings.db"
    with sqlite3.connect(path) as conn:
        initialize_alert_settings(conn)
        save_settings(
            conn,
            AlertSettings(
                high_occupancy_percent=95,
                low_confidence_percent=65,
                detector_stale_seconds=45,
            ),
        )
    with sqlite3.connect(path) as conn:
        initialize_alert_settings(conn)
        assert read_settings(conn)["detector_stale_seconds"] == 45
        assert read_settings(conn)["low_confidence_percent"] == 65


def test_frame_04_to_frame_05_five_real_state_changes(client):
    spaces = [
        {
            "spot_id": f"spot_{i}",
            "label": f"P{i}",
            "corners": [[i * 20, 0], [i * 20 + 10, 0], [i * 20 + 10, 10], [i * 20, 10]],
        }
        for i in range(1, 13)
    ]
    assert client.post("/map", json={"spots": spaces}).status_code == 200
    previous = {f"spot_{i}": "occupied" if i == 8 else "free" for i in range(1, 13)}
    current = {
        f"spot_{i}": "occupied" if i in (2, 5, 6, 10) else "free" for i in range(1, 13)
    }
    post(client, previous, "2026-10-05T19:03:56Z")
    post(client, current, "2026-10-05T19:27:32Z", {"spot_10": 0.534})
    active = client.get("/alerts", params={"active_only": True}).json()
    assert {a["type"] for a in active["items"]} == {"detector_stale", "low_confidence"}
    assert active["summary"]["active"] == 2
    all_alerts = client.get("/alerts", params={"active_only": False}).json()
    changes = [a for a in all_alerts["items"] if a["type"] == "state_change"]
    assert {
        (a["spot_label"], a["previous_status"], a["current_status"]) for a in changes
    } == {
        ("P8", "occupied", "free"),
        ("P2", "free", "occupied"),
        ("P5", "free", "occupied"),
        ("P6", "free", "occupied"),
        ("P10", "free", "occupied"),
    }
    assert all(
        a["layout_id"] == 1 and a["severity"] == "Info" and not a["active"]
        for a in changes
    )
    recent = client.get(
        "/alerts", params={"type": "state_change", "active_only": False, "limit": 5}
    ).json()
    assert recent["total"] == len(recent["items"]) == 5

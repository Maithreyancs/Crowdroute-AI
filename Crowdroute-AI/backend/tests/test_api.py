"""API Integration Tests for CrowdRoute AI FastAPI endpoints.
Tests /health, /api/scenario, /api/forecast, /api/allocate, and /api/simulate.
"""

import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def test_health_endpoint(client):
    """Verifies that GET /health returns status 200 and healthy metadata."""
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "healthy"
    assert data["service"] == "CrowdRoute AI"
    assert "SYNTHETIC DEMO" in data["disclaimer"]


def test_scenario_endpoint(client):
    """Verifies that GET /api/scenario returns valid synthetic scenario."""
    resp = client.get("/api/scenario")
    assert resp.status_code == 200
    data = resp.json()
    assert "stops" in data
    assert "fleet" in data
    assert len(data["fleet"]) == 16
    assert data["scenario_metadata"]["data_nature"] == "SYNTHETIC DEMO DATA"


def test_forecast_endpoint(client):
    """Verifies that POST /api/forecast returns valid demand forecasts."""
    payload = {
        "scheduled_event_end_time_override": "21:30",
        "weather_condition_override": "clear"
    }
    resp = client.post("/api/forecast", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert "intervals" in data
    assert "stop_summaries" in data
    assert "STOP_MAIN" in data["stop_summaries"]
    assert data["stop_summaries"]["STOP_MAIN"]["peak_interval"] == "21:30-21:45"


def test_allocate_endpoint(client):
    """Verifies that POST /api/allocate returns recommendations and fleet audit."""
    resp = client.post("/api/allocate", json={})
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] in ["SUCCESS", "NO_SAFE_MOVE"]
    assert "fleet_audit" in data
    assert data["fleet_audit"]["inventory_conserved"] is True
    assert data["fleet_audit"]["initial_fleet_count"] == 16
    assert data["fleet_audit"]["final_fleet_count"] == 16


def test_simulate_endpoint(client):
    """Verifies that POST /api/simulate returns comparative results."""
    resp = client.post("/api/simulate", json={})
    assert resp.status_code == 200
    data = resp.json()
    assert "baseline_simulation" in data
    assert "proposed_simulation" in data
    assert "net_comparison" in data
    assert data["fleet_audit"]["inventory_conserved"] is True
    assert data["baseline_simulation"]["total_passengers_arrived"] == data["proposed_simulation"]["total_passengers_arrived"]


def test_invalid_input_rejected(client):
    """Verifies that malformed time strings or invalid structures return 422 Unprocessable Entity."""
    # Invalid time format (not HH:MM)
    resp = client.post("/api/forecast", json={"scheduled_event_end_time_override": "not-a-time"})
    assert resp.status_code == 422

    # Invalid hour / minute combinations (99:99 and 21:75)
    resp_99 = client.post("/api/forecast", json={"scheduled_event_end_time_override": "99:99"})
    assert resp_99.status_code == 422

    resp_75 = client.post("/api/forecast", json={"scheduled_event_end_time_override": "21:75"})
    assert resp_75.status_code == 422

    resp_24 = client.post("/api/forecast", json={"scheduled_event_end_time_override": "24:00"})
    assert resp_24.status_code == 422

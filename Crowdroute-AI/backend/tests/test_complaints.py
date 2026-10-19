"""Tests for the Public Complaints & Citizen Grievance Reporting System.
Verifies complaint submission, SQLite persistence, validation, tracking, and privacy masking.
"""

import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def test_submit_complaint_success(client):
    """Verifies that a valid citizen complaint is saved and returns reference ID."""
    payload = {
        "category": "Overcrowding",
        "stop_id": "STOP_MAIN",
        "description": "Severe overcrowding near bay 4 after Maha Deepam fireworks.",
        "incident_time": "21:45",
        "contact_phone": "9876543210",
        "contact_email": "citizen@example.com",
    }
    resp = client.post("/api/complaints", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    assert "reference_id" in data
    assert data["reference_id"].startswith("CR-2026-")
    assert data["status"] == "Received"
    assert data["category"] == "Overcrowding"
    assert data["stop_id"] == "STOP_MAIN"
    assert data["created_at"] is not None


def test_submit_complaint_validation_error(client):
    """Verifies that invalid or empty inputs return HTTP 422."""
    # Description too short (< 5 chars)
    payload = {
        "category": "Overcrowding",
        "stop_id": "STOP_MAIN",
        "description": "bad",
    }
    resp = client.post("/api/complaints", json=payload)
    assert resp.status_code == 422

    # Invalid category
    payload_bad_cat = {
        "category": "AlienInvasion",
        "stop_id": "STOP_MAIN",
        "description": "Unknown category issue report.",
    }
    resp_bad = client.post("/api/complaints", json=payload_bad_cat)
    assert resp_bad.status_code == 422


def test_public_complaints_privacy_protection(client):
    """Verifies that public listing masks private phone and email data."""
    # Submit a complaint with private contact info
    private_phone = "9988776655"
    private_email = "private_citizen@domain.com"
    client.post("/api/complaints", json={
        "category": "Long Waiting Time",
        "stop_id": "STOP_PERIPHERAL",
        "description": "Waiting over 45 minutes for outbound connecting bus.",
        "contact_phone": private_phone,
        "contact_email": private_email,
    })

    # Fetch public list
    list_resp = client.get("/api/complaints")
    assert list_resp.status_code == 200
    items = list_resp.json()
    assert isinstance(items, list)
    assert len(items) > 0

    # Ensure phone and email fields are NOT present in public items
    for item in items:
        assert "contact_phone" not in item
        assert "contact_email" not in item
        assert "reference_id" in item
        assert "status" in item


def test_track_complaint_by_reference_id(client):
    """Verifies that a citizen can track their complaint status using their reference ID."""
    # 1. Create complaint
    create_resp = client.post("/api/complaints", json={
        "category": "Bus Delay",
        "stop_id": "STOP_EAST_GATE",
        "description": "Bus delayed by 25 minutes due to pedestrian gridlock.",
    })
    ref_id = create_resp.json()["reference_id"]

    # 2. Track complaint
    track_resp = client.get(f"/api/complaints/{ref_id}")
    assert track_resp.status_code == 200
    track_data = track_resp.json()
    assert track_data["reference_id"] == ref_id
    assert track_data["category"] == "Bus Delay"
    assert track_data["status"] == "Received"

    # 3. Non-existent reference returns 404
    bad_resp = client.get("/api/complaints/CR-2026-NONEXISTENT")
    assert bad_resp.status_code == 404

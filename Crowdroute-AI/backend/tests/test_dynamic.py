"""Dynamic Input-Driven & Historical Data Integration Tests for CrowdRoute AI.
Verifies all Phase 2 dynamic requirements:
1. Changing attendance dynamically scales passenger demand predictions.
2. Changing event timing shifts the synthetic and empirical demand peaks.
3. Changing bus availability alters allocator recommendations and triggers availability constraints.
4. Changing stop-wise demand distribution relocates bottlenecks to newly crowded stops.
5. Uploading historical CSV calibrates empirical predictions and computes actual-vs-predicted metrics.
6. Malformed historical files (missing headers, invalid times, negative passengers) are rejected.
7. User Data Mode rejects missing critical inputs (zero attendance, empty stops).
8. Synthetic mode labels are distinct and never presented as real observations.
9. Fixed-fleet conservation and source minimum service constraints hold under all dynamic scenarios.
10. Live telemetry endpoint reports truthful status when external feeds are unconfigured.
"""

import copy
import io
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models import (
    AllocateRequest,
    Bus,
    ForecastRequest,
    HistoricalRecord,
    ScenarioData,
    SimulateRequest,
    Stop,
    TimeHorizon,
)
from app.forecast import generate_demand_forecast, load_default_scenario
from app.allocator import allocate_fixed_fleet
from app.historical import (
    generate_sample_historical_csv,
    parse_and_validate_historical_file,
)
from app.live_data import get_live_data_summary


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def base_scenario() -> ScenarioData:
    return load_default_scenario()


# =====================================================================
# TEST 1: Changing attendance dynamically scales predictions
# =====================================================================

def test_changing_attendance_scales_predictions(base_scenario):
    """Verifies that predicted demand scales proportionally when attendance changes."""
    # 40,000 attendees (default)
    fc_40k = generate_demand_forecast(ForecastRequest(scenario=base_scenario, attendance_override=40000))
    total_40k = sum(s.total_demand for s in fc_40k.stop_summaries.values())

    # 20,000 attendees (half)
    fc_20k = generate_demand_forecast(ForecastRequest(scenario=base_scenario, attendance_override=20000))
    total_20k = sum(s.total_demand for s in fc_20k.stop_summaries.values())

    # 80,000 attendees (double)
    fc_80k = generate_demand_forecast(ForecastRequest(scenario=base_scenario, attendance_override=80000))
    total_80k = sum(s.total_demand for s in fc_80k.stop_summaries.values())

    # Half attendance should yield roughly half demand (+/- rounding)
    assert abs(total_20k - (total_40k / 2)) < 50
    # Double attendance should yield roughly double demand
    assert abs(total_80k - (total_40k * 2)) < 50
    assert total_80k > total_40k > total_20k


# =====================================================================
# TEST 2: Changing event timing shifts demand peak
# =====================================================================

def test_changing_event_timing_shifts_peak(base_scenario):
    """Verifies that altering the event conclusion time dynamically shifts the peak egress window."""
    # Event finishes early at 21:15
    fc_early = generate_demand_forecast(
        ForecastRequest(scenario=base_scenario, scheduled_event_end_time_override="21:15")
    )
    peak_early = fc_early.stop_summaries["STOP_MAIN"].peak_interval

    # Event finishes late at 22:15
    fc_late = generate_demand_forecast(
        ForecastRequest(scenario=base_scenario, scheduled_event_end_time_override="22:15")
    )
    peak_late = fc_late.stop_summaries["STOP_MAIN"].peak_interval

    assert peak_early == "21:15-21:30"
    assert peak_late == "22:15-22:30"
    assert peak_early != peak_late


# =====================================================================
# TEST 3: Changing bus availability alters allocator recommendations
# =====================================================================

def test_changing_bus_availability_alters_allocator(base_scenario):
    """Verifies that vehicle status changes dynamically influence optimization decisions."""
    sc = copy.deepcopy(base_scenario)

    # Initially, all 4 peripheral buses are available; allocator recommends moving 3 buses to STOP_MAIN
    alloc_initial = allocate_fixed_fleet(AllocateRequest(scenario=sc))
    assert alloc_initial.status == "SUCCESS"
    assert len(alloc_initial.recommended_moves) == 3

    # Mark 2 peripheral buses as maintenance; only 2 remain available
    # Donor min service is 1, so only 1 bus can now be safely relocated
    for b in sc.fleet:
        if b.bus_id in ["BUS-P01", "BUS-P02"]:
            b.status = "maintenance"

    alloc_reduced = allocate_fixed_fleet(AllocateRequest(scenario=sc))
    assert alloc_reduced.status == "SUCCESS"
    assert len(alloc_reduced.recommended_moves) == 1
    assert alloc_reduced.recommended_moves[0].bus_id not in ["BUS-P01", "BUS-P02"]

    # Mark all peripheral buses offline; no buses can be relocated
    for b in sc.fleet:
        if b.initial_stop_id == "STOP_PERIPHERAL":
            b.status = "offline"

    alloc_none = allocate_fixed_fleet(AllocateRequest(scenario=sc))
    assert alloc_none.status == "NO_SAFE_MOVE"
    assert len(alloc_none.recommended_moves) == 0


# =====================================================================
# TEST 4: Changing stop-wise demand distribution shifts bottlenecks
# =====================================================================

def test_changing_demand_distribution_shifts_bottlenecks(base_scenario):
    """Verifies that altering crowd destination shares relocates the deficit and reallocates accordingly."""
    sc = copy.deepcopy(base_scenario)

    # Invert the crowd flow: 95% go to STOP_PERIPHERAL, only 1% to STOP_MAIN
    sc.festival_programme.demand_distribution = {
        "STOP_MAIN": 0.01,
        "STOP_PERIPHERAL": 0.95,
        "STOP_EAST_GATE": 0.04,
    }

    # Station buses: 12 buses at STOP_MAIN, 4 buses at STOP_PERIPHERAL
    # With 95% crowd at STOP_PERIPHERAL, STOP_PERIPHERAL now has the massive deficit!
    fc = generate_demand_forecast(ForecastRequest(scenario=sc))
    assert fc.stop_summaries["STOP_PERIPHERAL"].overall_risk == "CRITICAL"
    assert fc.stop_summaries["STOP_PERIPHERAL"].peak_demand > 5000

    # Allocator must now recommend moving buses FROM STOP_MAIN TO STOP_PERIPHERAL!
    alloc = allocate_fixed_fleet(AllocateRequest(scenario=sc, forecast=fc))
    assert alloc.status == "SUCCESS"
    assert len(alloc.recommended_moves) > 0
    for move in alloc.recommended_moves:
        assert move.source_stop_id == "STOP_MAIN"
        assert move.destination_stop_id == "STOP_PERIPHERAL"


# =====================================================================
# TEST 5: Uploading historical CSV calibrates empirical predictions
# =====================================================================

def test_historical_csv_calibration_and_evaluation(base_scenario):
    """Verifies that valid historical records drive empirical forecasts and compute actuals."""
    sample_csv_text = generate_sample_historical_csv()
    upload_res = parse_and_validate_historical_file(sample_csv_text.encode("utf-8"), "past_festival.csv")

    assert upload_res.status == "SUCCESS"
    assert upload_res.valid_rows == 24
    assert len(upload_res.records) == 24
    assert "STOP_MAIN" in upload_res.stop_ids_found

    # Run forecast with historical records
    fc = generate_demand_forecast(
        ForecastRequest(
            scenario=base_scenario,
            historical_records=upload_res.records,
            operational_mode="USER_DATA",
        )
    )

    assert fc.confidence_level == "HIGH"
    assert "Historical Empirical Fit" in fc.confidence_indicator
    assert fc.actual_vs_predicted is not None
    assert fc.actual_vs_predicted.intervals_compared > 0
    assert fc.actual_vs_predicted.overall_mae >= 0.0
    assert fc.actual_vs_predicted.overall_mape >= 0.0


# =====================================================================
# TEST 6: Malformed historical files are rejected with clear error details
# =====================================================================

def test_malformed_historical_files_rejected():
    """Verifies that CSV files with missing columns, invalid times, or negative counts are flagged."""
    # 1. Missing columns
    missing_cols_csv = "timestamp,unrelated_col\n21:00,100\n".encode("utf-8")
    res1 = parse_and_validate_historical_file(missing_cols_csv, "missing_cols.csv")
    assert res1.status == "INVALID_FILE"
    assert any("Missing required columns" in err for err in res1.validation_errors)

    # 2. Invalid times (99:99, 21:75)
    invalid_time_csv = "time,stop_id,passengers\n99:99,STOP_MAIN,100\n21:75,STOP_MAIN,200\n21:00,STOP_MAIN,300\n".encode("utf-8")
    res2 = parse_and_validate_historical_file(invalid_time_csv, "invalid_times.csv")
    assert res2.valid_rows == 1  # only 21:00 is valid
    assert res2.invalid_rows_count == 2
    assert any("Invalid time '99:99'" in err for err in res2.validation_errors)
    assert any("Invalid time '21:75'" in err for err in res2.validation_errors)

    # 3. Negative passengers
    neg_pax_csv = "time,stop_id,passengers\n21:00,STOP_MAIN,-50\n".encode("utf-8")
    res3 = parse_and_validate_historical_file(neg_pax_csv, "negative_pax.csv")
    assert res3.status == "INVALID_FILE"
    assert any("Negative passenger count" in err for err in res3.validation_errors)

    # 4. Empty file
    res4 = parse_and_validate_historical_file(b"", "empty.csv")
    assert res4.status == "INVALID_FILE"


# =====================================================================
# TEST 7: User Data Mode rejects missing critical inputs
# =====================================================================

def test_user_data_mode_validation(base_scenario):
    """Verifies that User Data Mode strictly rejects missing attendance or empty stops."""
    sc = copy.deepcopy(base_scenario)

    # Zero attendance in User Data Mode
    with pytest.raises(ValueError, match="expected_total_attendance must be strictly positive"):
        generate_demand_forecast(
            ForecastRequest(
                scenario=sc,
                attendance_override=0,
                operational_mode="USER_DATA",
            )
        )

    # Empty stops list in User Data Mode
    sc.stops = []
    with pytest.raises(ValueError, match="at least one stop must be defined"):
        generate_demand_forecast(
            ForecastRequest(
                scenario=sc,
                operational_mode="USER_DATA",
            )
        )


# =====================================================================
# TEST 8: Synthetic mode labels are present and distinct from real data
# =====================================================================

def test_synthetic_labels_distinction(base_scenario):
    """Verifies that synthetic demo mode outputs are clearly labeled and never masquerade as real."""
    fc_synth = generate_demand_forecast(
        ForecastRequest(scenario=base_scenario, operational_mode="DEMO_SYNTHETIC")
    )
    assert "SYNTHETIC DEMO" in fc_synth.disclaimer
    assert fc_synth.confidence_level == "PRELIMINARY_BASELINE"
    assert any("Synthetic demand distribution" in a for a in fc_synth.assumptions)
    assert len(fc_synth.data_limitations) > 0

    fc_user = generate_demand_forecast(
        ForecastRequest(scenario=base_scenario, operational_mode="USER_DATA")
    )
    assert "USER DATA MODE" in fc_user.disclaimer


# =====================================================================
# TEST 9: Fixed-fleet conservation and minimum service constraints
# =====================================================================

def test_fixed_fleet_conservation_under_dynamic_inputs(base_scenario):
    """Verifies that fleet conservation and minimum service thresholds hold under any dynamic inputs."""
    sc = copy.deepcopy(base_scenario)
    sc.festival_programme.expected_total_attendance = 75000  # High attendance surge

    alloc = allocate_fixed_fleet(AllocateRequest(scenario=sc))
    audit = alloc.fleet_audit

    assert audit.inventory_conserved is True
    assert audit.initial_fleet_count == audit.final_fleet_count == 16
    assert audit.duplicate_buses_detected is False
    assert audit.invented_buses_detected is False

    # Check minimum service preserved at donor stop
    for move in alloc.recommended_moves:
        assert move.source_service_after >= 1  # Peripheral stop min service is 1


# =====================================================================
# TEST 10: Live telemetry endpoint reports truthful status
# =====================================================================

def test_live_data_status_truthful():
    """Verifies that live status endpoint does not invent fake live weather or AVL telemetry."""
    status = get_live_data_summary()
    assert status.weather_feed.source_name == "Regional Live Weather Service"
    assert status.weather_feed.is_available is False
    assert status.weather_feed.status in ["UNAVAILABLE", "OFFLINE"]
    assert "STANDALONE_DETERMINISTIC_MODE" in status.overall_status


# =====================================================================
# TEST 11: HTTP endpoints for historical upload and scenario validation
# =====================================================================

def test_api_historical_upload_and_validation(client, base_scenario):
    """Tests POST /api/historical/upload and POST /api/validate/scenario."""
    # Test sample download
    resp_sample = client.get("/api/historical/sample")
    assert resp_sample.status_code == 200
    assert "STOP_MAIN" in resp_sample.text

    # Test upload via HTTP
    csv_bytes = generate_sample_historical_csv().encode("utf-8")
    files = {"file": ("festival_2025.csv", io.BytesIO(csv_bytes), "text/csv")}
    resp_up = client.post("/api/historical/upload", files=files)
    assert resp_up.status_code == 200
    data_up = resp_up.json()
    assert data_up["status"] == "SUCCESS"
    assert data_up["valid_rows"] == 24

    # Test scenario validation endpoint
    sc_dict = base_scenario.model_dump()
    resp_val = client.post("/api/validate/scenario", json=sc_dict)
    assert resp_val.status_code == 200
    data_val = resp_val.json()
    assert data_val["is_valid"] is True
    assert len(data_val["missing_fields"]) == 0

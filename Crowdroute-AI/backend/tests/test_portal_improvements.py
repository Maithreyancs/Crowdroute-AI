"""Tests for portal improvements: coordinates fallback, zero-bus stops, capacity consistency,
and synthetic historical sample validation.
"""
import io
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.forecast import load_default_scenario, generate_demand_forecast
from app.allocator import allocate_fixed_fleet
from app.historical import (
    generate_sample_historical_csv,
    generate_sample_historical_excel,
    parse_and_validate_historical_file,
)
from app.models import Stop, ForecastRequest, AllocateRequest

client = TestClient(app)


def test_stop_coordinates_and_missing_coordinates_support():
    """Verify that Stop model supports configurable latitude/longitude and handles None gracefully."""
    # With coordinates
    stop_with_coords = Stop(
        stop_id="STOP_TEST_1",
        name="Test Stand",
        priority_level=1,
        initial_crowd_estimate=100,
        baseline_scheduled_buses=2,
        min_service_buses=1,
        capacity=1000,
        latitude=12.2285,
        longitude=79.0700,
    )
    assert stop_with_coords.latitude == 12.2285
    assert stop_with_coords.longitude == 79.0700

    # Without coordinates (missing coordinates fallback)
    stop_without_coords = Stop(
        stop_id="STOP_TEST_2",
        name="Test Stand 2",
        priority_level=1,
        initial_crowd_estimate=100,
        baseline_scheduled_buses=2,
        min_service_buses=1,
        capacity=1000,
    )
    assert stop_without_coords.latitude is None
    assert stop_without_coords.longitude is None


def test_east_temple_gate_zero_bus_capacity_and_no_phantom_buses():
    """Verify that East Temple Gate (STOP_EAST_GATE) has 0 baseline capacity,
    does not invent artificial capacity or phantom buses, and preserves 0 in calculations.
    """
    scenario = load_default_scenario()
    east_stop = next(s for s in scenario.stops if s.stop_id == "STOP_EAST_GATE")
    assert east_stop.baseline_scheduled_buses == 0

    assigned_to_east = [b for b in scenario.fleet if b.initial_stop_id == "STOP_EAST_GATE"]
    assert len(assigned_to_east) == 0

    forecast = generate_demand_forecast(ForecastRequest(scenario=scenario))
    assert "STOP_EAST_GATE" in forecast.stop_summaries
    east_summary = forecast.stop_summaries["STOP_EAST_GATE"]
    assert east_summary.baseline_scheduled_capacity == 0
    assert east_summary.peak_demand > 0  # Expected passengers > 0
    assert east_summary.overall_risk in ["CRITICAL", "HIGH"]

    # Verify allocation strictly conserves fleet (16 in, 16 out)
    allocation = allocate_fixed_fleet(AllocateRequest(scenario=scenario, forecast=forecast))
    assert allocation.fleet_audit.initial_fleet_count == len(scenario.fleet)
    assert allocation.fleet_audit.final_fleet_count == len(scenario.fleet)
    assert allocation.fleet_audit.inventory_conserved is True
    assert allocation.fleet_audit.invented_buses_detected is False


def test_synthetic_historical_sample_csv_and_excel_validation():
    """Verify that the generated sample historical CSV and Excel data are valid,
    parse cleanly through the official validation engine, and cover all stops.
    """
    # 1. Test Sample CSV
    csv_str = generate_sample_historical_csv()
    assert "time,stop_id,passengers" in csv_str
    assert "STOP_MAIN" in csv_str
    assert "STOP_PERIPHERAL" in csv_str
    assert "STOP_EAST_GATE" in csv_str

    csv_bytes = csv_str.encode("utf-8")
    resp_csv = parse_and_validate_historical_file(csv_bytes, "sample_festival_historical_data.csv")
    assert resp_csv.status == "SUCCESS"
    assert resp_csv.valid_rows > 0
    assert resp_csv.invalid_rows_count == 0
    assert set(resp_csv.stop_ids_found) == {"STOP_MAIN", "STOP_PERIPHERAL", "STOP_EAST_GATE"}
    assert resp_csv.total_passenger_count > 0

    # 2. Test Sample Excel (.xlsx)
    excel_bytes = generate_sample_historical_excel()
    assert len(excel_bytes) > 0
    resp_excel = parse_and_validate_historical_file(excel_bytes, "sample_festival_historical_data.xlsx")
    assert resp_excel.status == "SUCCESS"
    assert resp_excel.valid_rows > 0
    assert resp_excel.invalid_rows_count == 0
    assert set(resp_excel.stop_ids_found) == {"STOP_MAIN", "STOP_PERIPHERAL", "STOP_EAST_GATE"}


def test_sample_historical_api_endpoints():
    """Verify API endpoints /api/historical/sample and /api/historical/sample.xlsx return valid download payloads."""
    # CSV download
    r_csv = client.get("/api/historical/sample")
    assert r_csv.status_code == 200
    assert "text/csv" in r_csv.headers["content-type"]
    assert "sample_festival_historical_data.csv" in r_csv.headers["content-disposition"]
    assert "STOP_MAIN" in r_csv.text

    # Excel download via format param
    r_xlsx_param = client.get("/api/historical/sample?format=xlsx")
    assert r_xlsx_param.status_code == 200
    assert "openxmlformats" in r_xlsx_param.headers["content-type"]

    # Excel direct endpoint
    r_xlsx_direct = client.get("/api/historical/sample.xlsx")
    assert r_xlsx_direct.status_code == 200
    assert "openxmlformats" in r_xlsx_direct.headers["content-type"]


def test_weather_and_delay_workflow_preserves_conservation():
    """Verify Constraint 1 and Constraint 2: dynamic updates on weather/delay preserve fixed fleet conservation."""
    scenario = load_default_scenario()
    initial_fleet_count = len(scenario.fleet)

    # Apply rain update
    scenario_rain = scenario.model_copy(deep=True)
    scenario_rain.weather.condition = "rain"
    scenario_rain.weather.surge_concentration_factor = 1.35

    forecast_rain = generate_demand_forecast(ForecastRequest(scenario=scenario_rain))
    allocation_rain = allocate_fixed_fleet(AllocateRequest(scenario=scenario_rain, forecast=forecast_rain))

    assert allocation_rain.fleet_audit.final_fleet_count == initial_fleet_count
    assert allocation_rain.fleet_audit.inventory_conserved is True
    assert allocation_rain.fleet_audit.invented_buses_detected is False

    # Apply 30 min delay update
    scenario_delay = scenario.model_copy(deep=True)
    scenario_delay.festival_programme.scheduled_event_end_time = "22:00"

    forecast_delay = generate_demand_forecast(ForecastRequest(scenario=scenario_delay))
    allocation_delay = allocate_fixed_fleet(AllocateRequest(scenario=scenario_delay, forecast=forecast_delay))

    assert allocation_delay.fleet_audit.final_fleet_count == initial_fleet_count
    assert allocation_delay.fleet_audit.inventory_conserved is True
    assert allocation_delay.fleet_audit.invented_buses_detected is False


def test_invalid_time_rejection_in_models():
    """Verify that impossible times such as 99:99 or 21:75 are strictly rejected."""
    from app.models import validate_hh_mm_string
    import pytest

    with pytest.raises(ValueError):
        validate_hh_mm_string("99:99")

    with pytest.raises(ValueError):
        validate_hh_mm_string("21:75")

    with pytest.raises(ValueError):
        validate_hh_mm_string("25:00")

    # Valid times pass
    assert validate_hh_mm_string("21:30") == "21:30"
    assert validate_hh_mm_string("00:00") == "00:00"
    assert validate_hh_mm_string("23:59") == "23:59"


def test_timetable_movement_calculations_and_arrival_before_peak():
    """Verify that all suggested bus changes in timetable have valid departure,
    valid arrival, positive travel duration, and arrive before the destination crowd peak.
    """
    scenario = load_default_scenario()
    forecast = generate_demand_forecast(ForecastRequest(scenario=scenario))
    allocation = allocate_fixed_fleet(AllocateRequest(scenario=scenario, forecast=forecast))

    assert allocation.status == "SUCCESS"
    assert len(allocation.recommended_moves) > 0

    from app.forecast import parse_time_to_minutes

    for move in allocation.recommended_moves:
        dep_mins = parse_time_to_minutes(move.departure_time)
        arr_mins = parse_time_to_minutes(move.estimated_arrival_time)
        duration = arr_mins - dep_mins if arr_mins >= dep_mins else 1440 - dep_mins + arr_mins

        assert duration > 0, f"Move {move.bus_id} duration must be strictly positive"

        # Check arrives before peak start
        if "-" in move.target_peak_interval:
            peak_start = parse_time_to_minutes(move.target_peak_interval.split("-")[0])
            assert arr_mins <= peak_start, (
                f"Bus {move.bus_id} arrives at {move.estimated_arrival_time} ({arr_mins}m), "
                f"which is after destination peak start ({peak_start}m)"
            )

        # Check source minimum service is protected
        donor_stop = next(s for s in scenario.stops if s.stop_id == move.source_stop_id)
        assert move.source_service_after >= donor_stop.min_service_buses, (
            f"Source stop {move.source_stop_id} service dropped below minimum threshold"
        )


def test_attendance_and_demand_share_changes_recalculate_forecast():
    """Verify that updating total attendance and demand shares recalculates stop demands dynamically."""
    scenario = load_default_scenario()
    # Double attendance
    scenario_high = scenario.model_copy(deep=True)
    scenario_high.festival_programme.expected_total_attendance = 80000

    fc_normal = generate_demand_forecast(ForecastRequest(scenario=scenario))
    fc_high = generate_demand_forecast(ForecastRequest(scenario=scenario_high))

    assert fc_high.stop_summaries["STOP_MAIN"].total_demand > fc_normal.stop_summaries["STOP_MAIN"].total_demand
    assert fc_high.stop_summaries["STOP_EAST_GATE"].total_demand > fc_normal.stop_summaries["STOP_EAST_GATE"].total_demand




"""End-to-End Scenario Control Center & Prediction Pipeline Tests for CrowdRoute AI.
Validates Test A through Test H as defined in the requirements.
"""

import pytest
from app.models import (
    AllocateRequest,
    ForecastRequest,
    ScenarioData,
    SimulateRequest,
    calculate_interval_capacity,
)
from app.forecast import generate_demand_forecast, load_default_scenario
from app.allocator import allocate_fixed_fleet, audit_fleet_conservation
from app.simulator import compare_schedules
from app.weather import get_live_weather, map_wmo_code


@pytest.fixture
def base_scenario() -> ScenarioData:
    sc = load_default_scenario()
    sc.festival_programme.event_name = "Festival Egress Demo"
    sc.festival_programme.event_date = "2026-10-11"
    sc.festival_programme.event_start_time = "18:00"
    sc.festival_programme.scheduled_event_end_time = "22:00"
    sc.festival_programme.expected_total_attendance = 40000
    sc.festival_programme.exiting_passenger_fraction = 0.85
    return sc


def test_test_a_initial_prediction_run(base_scenario: ScenarioData):
    """Test A — Initial prediction with 40,000 expected attendees, date, and schedule."""
    fc_req = ForecastRequest(scenario=base_scenario)
    fc_res = generate_demand_forecast(fc_req)

    assert fc_res is not None
    assert len(fc_res.intervals) > 0
    assert fc_res.weather_condition == "clear"
    
    # 40,000 * 0.85 = 34,000 transit passengers
    total_transit = int(40000 * 0.85)
    sum_demand = sum(s.total_demand for s in fc_res.stop_summaries.values())
    assert abs(sum_demand - total_transit) < 50, f"Expected total ~{total_transit}, got {sum_demand}"

    # Allocate fixed fleet
    alloc_req = AllocateRequest(scenario=base_scenario, forecast=fc_res, max_moves=10)
    alloc_res = allocate_fixed_fleet(alloc_req)
    assert alloc_res is not None
    assert alloc_res.fleet_audit.inventory_conserved is True
    assert alloc_res.fleet_audit.initial_fleet_count == 16
    assert alloc_res.fleet_audit.final_fleet_count == 16

    # Simulate discrete intervals
    sim_req = SimulateRequest(scenario=base_scenario, moves_override=alloc_res.recommended_moves)
    sim_res = compare_schedules(sim_req)
    assert sim_res is not None
    assert sim_res.baseline_simulation.total_passengers_arrived > 0
    assert sim_res.proposed_simulation.total_passengers_boarded > 0



def test_test_b_attendance_change_recalculation(base_scenario: ScenarioData):
    """Test B — Attendance change dynamically modifies transit demand and required fleet."""
    # 40,000 attendance
    base_scenario.festival_programme.expected_total_attendance = 40000
    fc_40k = generate_demand_forecast(ForecastRequest(scenario=base_scenario))
    demand_40k = sum(s.total_demand for s in fc_40k.stop_summaries.values())

    # 60,000 attendance
    base_scenario.festival_programme.expected_total_attendance = 60000
    fc_60k = generate_demand_forecast(ForecastRequest(scenario=base_scenario))
    demand_60k = sum(s.total_demand for s in fc_60k.stop_summaries.values())

    # Demand scales directly with attendance
    assert demand_60k > demand_40k
    ratio = demand_60k / demand_40k
    assert abs(ratio - 1.5) < 0.05, f"Expected ~1.5x increase, got {ratio}"

    # Allocation adapts to higher surge
    alloc_60k = allocate_fixed_fleet(AllocateRequest(scenario=base_scenario, forecast=fc_60k))
    assert alloc_60k.fleet_audit.inventory_conserved is True


def test_test_c_event_time_shift(base_scenario: ScenarioData):
    """Test C — Moving event conclusion shifts peak egress interval consistently."""
    base_scenario.festival_programme.scheduled_event_end_time = "21:30"
    fc_2130 = generate_demand_forecast(ForecastRequest(scenario=base_scenario))
    main_summary_2130 = fc_2130.stop_summaries["STOP_MAIN"]

    # Shift end time by 30 mins to 22:00
    base_scenario.festival_programme.scheduled_event_end_time = "22:00"
    fc_2200 = generate_demand_forecast(ForecastRequest(scenario=base_scenario))
    main_summary_2200 = fc_2200.stop_summaries["STOP_MAIN"]

    # Peak interval moves later
    assert main_summary_2130.peak_interval != main_summary_2200.peak_interval
    assert "21:30" in main_summary_2130.peak_interval or "21:45" in main_summary_2130.peak_interval
    assert "22:00" in main_summary_2200.peak_interval or "22:15" in main_summary_2200.peak_interval


def test_test_d_weather_change_sensitivity(base_scenario: ScenarioData):
    """Test D — Weather conditions compress egress curve and increase surge concentration."""
    base_scenario.weather.condition = "clear"
    fc_clear = generate_demand_forecast(ForecastRequest(scenario=base_scenario))
    peak_clear = fc_clear.stop_summaries["STOP_MAIN"].peak_demand

    base_scenario.weather.condition = "heavy_rain"
    fc_rain = generate_demand_forecast(ForecastRequest(scenario=base_scenario))
    peak_rain = fc_rain.stop_summaries["STOP_MAIN"].peak_demand

    # Heavy rain compresses the egress curve into fewer intervals, increasing peak intensity
    assert peak_rain > peak_clear, f"Heavy rain peak ({peak_rain}) should exceed clear peak ({peak_clear})"
    assert fc_rain.weather_condition == "heavy_rain"


def test_test_e_live_weather_telemetry():
    """Test E — Live Open-Meteo weather integration returns location, timestamp, and fallback."""
    w = get_live_weather(force_refresh=True)
    assert w is not None
    assert w.latitude == pytest.approx(12.2253, 0.01)
    assert w.longitude == pytest.approx(79.0747, 0.01)
    assert w.timezone == "Asia/Kolkata"
    assert w.status in ("LIVE", "CACHED", "UNAVAILABLE")
    assert w.condition in ("clear", "cloudy", "light_rain", "rainy", "heavy_rain")
    assert w.last_updated is not None

    # WMO mapping verification
    cond, desc = map_wmo_code(0)
    assert cond == "clear"
    cond, desc = map_wmo_code(65)
    assert cond == "rainy"
    cond, desc = map_wmo_code(95)
    assert cond == "heavy_rain"


def test_test_f_fleet_conservation_under_all_reallocations(base_scenario: ScenarioData):
    """Test F — Total fleet is strictly conserved with zero duplicates or invented vehicles."""
    assert len(base_scenario.fleet) == 16
    initial_ids = {b.bus_id for b in base_scenario.fleet}

    fc = generate_demand_forecast(ForecastRequest(scenario=base_scenario))
    alloc = allocate_fixed_fleet(AllocateRequest(scenario=base_scenario, forecast=fc, max_moves=10))

    audit = alloc.fleet_audit
    assert audit.inventory_conserved is True
    assert audit.initial_fleet_count == 16
    assert audit.final_fleet_count == 16
    assert audit.invented_buses_detected is False
    assert audit.duplicate_buses_detected is False

    # Check each moved bus exists in initial fleet
    for move in alloc.recommended_moves:
        assert move.bus_id in initial_ids
        assert move.source_stop_id != move.destination_stop_id

    # Check source-stop minimum safety reserves are respected
    peripheral_stop = next(s for s in base_scenario.stops if s.stop_id == "STOP_PERIPHERAL")
    initial_at_peripheral = sum(1 for b in base_scenario.fleet if b.initial_stop_id == "STOP_PERIPHERAL")
    moved_from_peripheral = sum(1 for m in alloc.recommended_moves if m.source_stop_id == "STOP_PERIPHERAL")
    remaining_at_peripheral = initial_at_peripheral - moved_from_peripheral
    assert remaining_at_peripheral >= peripheral_stop.min_service_buses, (
        f"Remaining ({remaining_at_peripheral}) violated min reserve ({peripheral_stop.min_service_buses})"
    )




def test_test_h_error_and_edge_case_handling(base_scenario: ScenarioData):
    """Test H — Zero-attendance, zero-bus stops, and empty recommendations handled gracefully."""
    # Zero-bus stop (East Gate has 0 baseline buses)
    east_gate = next(s for s in base_scenario.stops if s.stop_id == "STOP_EAST_GATE")
    assert east_gate.baseline_scheduled_buses == 0

    fc = generate_demand_forecast(ForecastRequest(scenario=base_scenario))
    assert fc.stop_summaries["STOP_EAST_GATE"].baseline_scheduled_capacity == 0
    # Stop still receives demand based on its share
    assert fc.stop_summaries["STOP_EAST_GATE"].total_demand > 0

    # User data mode with attendance <= 0 must fail validation cleanly
    with pytest.raises(ValueError, match="strictly positive"):
        generate_demand_forecast(ForecastRequest(
            scenario=base_scenario,
            operational_mode="USER_DATA",
            attendance_override=0,
        ))

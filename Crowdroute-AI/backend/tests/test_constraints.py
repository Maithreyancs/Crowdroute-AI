"""Tests for Official Hackathon Constraints 1 & 2 in CrowdRoute AI.

Verifies:
Constraint 1: Automatic reaction to live condition changes (weather & event delays).
Constraint 2: Fixed fleet with visible dual-sided service trade-offs (conservation & minimum service).
"""

import copy
import pytest

from app.models import (
    AllocateRequest,
    ForecastRequest,
    ScenarioData,
)
from app.forecast import generate_demand_forecast, load_default_scenario, parse_time_to_minutes
from app.allocator import allocate_fixed_fleet
from app.simulator import run_discrete_simulation, compare_schedules


@pytest.fixture
def scenario() -> ScenarioData:
    return load_default_scenario()


# =====================================================================
# CONSTRAINT 1: LIVE CONDITION CHANGES (WEATHER & DELAYS)
# =====================================================================

def test_constraint_1_weather_rainfall_sharpens_peak_surge(scenario):
    """Verifies that rain (Clear -> Rainy -> Heavy Rain) dynamically sharpens peak crowd demand."""
    # 1. Clear weather baseline
    scenario_clear = copy.deepcopy(scenario)
    scenario_clear.weather.condition = "clear"
    fc_clear = generate_demand_forecast(ForecastRequest(scenario=scenario_clear))

    # 2. Rainy weather
    scenario_rainy = copy.deepcopy(scenario)
    scenario_rainy.weather.condition = "rainy"
    fc_rainy = generate_demand_forecast(ForecastRequest(scenario=scenario_rainy))

    # 3. Heavy rain
    scenario_heavy = copy.deepcopy(scenario)
    scenario_heavy.weather.condition = "heavy_rain"
    fc_heavy = generate_demand_forecast(ForecastRequest(scenario=scenario_heavy))

    # Total attendees should remain constant (within 2 passengers due to 8-interval integer floor rounding)
    tot_clear = sum(s.total_demand for s in fc_clear.stop_summaries.values())
    tot_rainy = sum(s.total_demand for s in fc_rainy.stop_summaries.values())
    tot_heavy = sum(s.total_demand for s in fc_heavy.stop_summaries.values())
    assert abs(tot_clear - 34000) <= 2
    assert abs(tot_rainy - 34000) <= 2
    assert abs(tot_heavy - 34000) <= 2

    # Peak interval passenger demand at Main stand should increase under rain due to compressed surge
    main_peak_clear = fc_clear.stop_summaries["STOP_MAIN"].peak_demand
    main_peak_rainy = fc_rainy.stop_summaries["STOP_MAIN"].peak_demand
    main_peak_heavy = fc_heavy.stop_summaries["STOP_MAIN"].peak_demand

    assert main_peak_rainy > main_peak_clear, "Rainy weather must compress departure curve and increase peak surge"
    assert main_peak_heavy > main_peak_rainy, "Heavy rain must further concentrate crowd egress"
    assert fc_rainy.weather_condition in ("rainy", "light_rain")
    assert fc_heavy.weather_condition == "heavy_rain"


def test_constraint_1_event_delay_shifts_peak_timing_chronologically(scenario):
    """Verifies that delaying the final event by 30 minutes shifts expected peak times by 30 minutes."""
    # Default event end: 21:30
    fc_baseline = generate_demand_forecast(ForecastRequest(scenario=scenario))
    base_peak_interval = fc_baseline.stop_summaries["STOP_MAIN"].peak_interval
    assert base_peak_interval == "21:30-21:45"

    # Event delayed by 30 mins to 22:00
    delayed_scenario = copy.deepcopy(scenario)
    delayed_scenario.festival_programme.scheduled_event_end_time = "22:00"
    fc_delayed = generate_demand_forecast(ForecastRequest(scenario=delayed_scenario))

    delayed_peak_interval = fc_delayed.stop_summaries["STOP_MAIN"].peak_interval
    assert delayed_peak_interval == "22:00-22:15", "Peak demand interval must shift 30 minutes forward"

    # The allocator must receive this shifted peak and calculate arrivals accordingly
    alloc_res = allocate_fixed_fleet(AllocateRequest(scenario=delayed_scenario, forecast=fc_delayed))
    if alloc_res.recommended_moves:
        for move in alloc_res.recommended_moves:
            assert move.target_peak_interval == "22:00-22:15"


# =====================================================================
# CONSTRAINT 2: FIXED FLEET INVARIANT & VISIBLE DUAL-SIDED TRADE-OFFS
# =====================================================================

def test_constraint_2_strict_fleet_conservation_under_all_conditions(scenario):
    """Verifies that total bus inventory is strictly conserved (16 before = 16 after)."""
    # Test under multiple weather and delay configurations
    configurations = [
        ("clear", "21:30"),
        ("rainy", "21:30"),
        ("heavy_rain", "21:45"),
        ("cloudy", "22:00"),
    ]

    for weather, end_time in configurations:
        test_sc = copy.deepcopy(scenario)
        test_sc.weather.condition = weather
        test_sc.festival_programme.scheduled_event_end_time = end_time

        fc = generate_demand_forecast(ForecastRequest(scenario=test_sc))
        alloc = allocate_fixed_fleet(AllocateRequest(scenario=test_sc, forecast=fc))

        # 1. Audit invariant
        audit = alloc.fleet_audit
        assert audit.inventory_conserved is True
        assert audit.initial_fleet_count == 16
        assert audit.final_fleet_count == 16
        assert audit.duplicate_buses_detected is False
        assert audit.invented_buses_detected is False

        # 2. No bus appears twice in recommendations
        moved_ids = [m.bus_id for m in alloc.recommended_moves]
        assert len(moved_ids) == len(set(moved_ids)), "A bus cannot be allocated multiple times"


def test_constraint_2_every_move_exposes_destination_benefit_and_source_loss(scenario):
    """Verifies that every approved move explicitly shows destination benefit and source-stop impact."""
    fc = generate_demand_forecast(ForecastRequest(scenario=scenario))
    alloc = allocate_fixed_fleet(AllocateRequest(scenario=scenario, forecast=fc))

    assert len(alloc.recommended_moves) > 0, "Default scenario should produce safe relocations"

    for move in alloc.recommended_moves:
        # Destination side
        assert move.estimated_destination_benefit > 0, "Must quantify destination capacity gain"
        assert len(move.destination_need_reason) > 0

        # Source side
        assert move.source_service_before > move.source_service_after, "Must record bus deduction from source"
        assert len(move.source_service_impact_description) > 0
        assert move.source_stop_id != move.destination_stop_id

        # Verification that source retained required minimum
        source_stop = next(s for s in scenario.stops if s.stop_id == move.source_stop_id)
        assert move.source_service_after >= source_stop.min_service_buses, "Source minimum service must be protected"


def test_constraint_2_rejects_unsafe_moves_honestly_when_min_service_threatened(scenario):
    """Verifies that when donor stop is already at minimum service, relocation is rejected."""
    constrained_sc = copy.deepcopy(scenario)
    # Peripheral stop currently has 4 buses. Set min_service_buses = 4.
    periph_stop = next(s for s in constrained_sc.stops if s.stop_id == "STOP_PERIPHERAL")
    periph_stop.min_service_buses = 4

    fc = generate_demand_forecast(ForecastRequest(scenario=constrained_sc))
    alloc = allocate_fixed_fleet(AllocateRequest(scenario=constrained_sc, forecast=fc))

    # All moves from STOP_PERIPHERAL must be rejected because leaving would reduce fleet to 3 < 4
    periph_approved_moves = [m for m in alloc.recommended_moves if m.source_stop_id == "STOP_PERIPHERAL"]
    assert len(periph_approved_moves) == 0, "Cannot approve move that breaches minimum source service"

    # There must be a recorded rejection explaining the constraint violation
    periph_rejections = [r for r in alloc.rejected_moves if r.source_stop_id == "STOP_PERIPHERAL"]
    assert len(periph_rejections) > 0
    assert any("HARD_CONSTRAINT_MINIMUM_SOURCE_SERVICE" in r.constraint_violated for r in periph_rejections)

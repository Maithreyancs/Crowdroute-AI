"""Comprehensive Unit and Integration Tests for CrowdRoute AI.
Strictly verifies all 12 required test conditions:
1. Fleet count remains exactly unchanged.
2. No bus is duplicated or invented.
3. Unavailable buses cannot be moved.
4. Incompatible routes are rejected.
5. A bus arriving after the peak is not recommended for that peak.
6. Every proposed move has an explicit source-service impact.
7. A move that violates minimum source service is rejected.
8. Missing source-service information prevents an unsafe recommendation.
9. No feasible move returns "No safe move".
10. Invalid IDs, negative capacities, and invalid inputs are rejected.
11. Delaying the final event shifts the synthetic demand peak according to the configured forecast rules.
12. Baseline and proposed simulations use the same initial fleet and demand assumptions.
"""

import copy
import pytest
from pydantic import ValidationError

from app.models import (
    AllocateRequest,
    Bus,
    BusMove,
    FestivalProgramme,
    ForecastRequest,
    ScenarioData,
    ScenarioMetadata,
    SimulateRequest,
    Stop,
    TimeHorizon,
    WeatherScenario,
    calculate_interval_capacity,
)
from app.forecast import (
    generate_demand_forecast,
    load_default_scenario,
    parse_time_to_minutes,
)
from app.allocator import allocate_fixed_fleet, audit_fleet_conservation
from app.tradeoffs import evaluate_candidate_move
from app.simulator import compare_schedules, run_discrete_simulation


# =====================================================================
# FIXTURES
# =====================================================================

@pytest.fixture
def default_scenario() -> ScenarioData:
    """Returns a fresh deep copy of the default scenario."""
    return load_default_scenario()


# =====================================================================
# TEST 1: Fleet count remains exactly unchanged
# =====================================================================

def test_1_fleet_count_remains_exactly_unchanged(default_scenario):
    """Verifies that the fleet size before and after allocation and simulation is identical."""
    initial_count = len(default_scenario.fleet)
    assert initial_count == 16, "Default scenario should configure 16 buses"

    alloc_res = allocate_fixed_fleet(AllocateRequest(scenario=default_scenario))
    assert alloc_res.fleet_audit.initial_fleet_count == initial_count
    assert alloc_res.fleet_audit.final_fleet_count == initial_count
    assert alloc_res.fleet_audit.inventory_conserved is True

    sim_res = compare_schedules(SimulateRequest(scenario=default_scenario))
    assert sim_res.initial_fleet_count == initial_count
    assert sim_res.fleet_audit.initial_fleet_count == initial_count
    assert sim_res.fleet_audit.final_fleet_count == initial_count
    assert sim_res.fleet_audit.inventory_conserved is True


# =====================================================================
# TEST 2: No bus is duplicated or invented
# =====================================================================

def test_2_no_bus_duplicated_or_invented(default_scenario):
    """Verifies that only existing buses are moved and no duplicate assignments occur."""
    original_bus_ids = {b.bus_id for b in default_scenario.fleet}

    alloc_res = allocate_fixed_fleet(AllocateRequest(scenario=default_scenario))
    assert alloc_res.fleet_audit.duplicate_buses_detected is False
    assert alloc_res.fleet_audit.invented_buses_detected is False

    moved_ids = [m.bus_id for m in alloc_res.recommended_moves]
    # No bus invented: every moved bus must exist in initial fleet
    for b_id in moved_ids:
        assert b_id in original_bus_ids, f"Invented bus ID {b_id} detected!"

    # No bus duplicated in recommendation batch
    assert len(moved_ids) == len(set(moved_ids)), "Duplicate bus movement detected in recommendation batch!"


# =====================================================================
# TEST 3: Unavailable buses cannot be moved
# =====================================================================

def test_3_unavailable_buses_cannot_be_moved(default_scenario):
    """Verifies that vehicles marked maintenance/offline are rejected from reallocation."""
    # Mark all peripheral buses as maintenance
    scenario_modified = copy.deepcopy(default_scenario)
    for b in scenario_modified.fleet:
        if b.initial_stop_id == "STOP_PERIPHERAL":
            b.status = "maintenance"

    alloc_res = allocate_fixed_fleet(AllocateRequest(scenario=scenario_modified))
    # All candidate moves from peripheral must be rejected due to availability
    for move in alloc_res.recommended_moves:
        bus_obj = next(b for b in scenario_modified.fleet if b.bus_id == move.bus_id)
        assert bus_obj.status == "available"

    # Verify that maintenance buses appear in rejected candidates
    rejection_reasons = [r.constraint_violated for r in alloc_res.rejected_moves]
    assert "HARD_CONSTRAINT_BUS_AVAILABILITY" in rejection_reasons


# =====================================================================
# TEST 4: Incompatible routes are rejected
# =====================================================================

def test_4_incompatible_routes_are_rejected(default_scenario):
    """Verifies that buses without compatible destination authorization are rejected."""
    scenario_modified = copy.deepcopy(default_scenario)
    # Restrict peripheral buses so they are NOT compatible with STOP_MAIN
    for b in scenario_modified.fleet:
        if b.initial_stop_id == "STOP_PERIPHERAL":
            b.compatible_stops = ["STOP_PERIPHERAL"]  # Main Stand not permitted
            b.compatible_routes = ["ROUTE-LOCAL-ONLY"]

    alloc_res = allocate_fixed_fleet(AllocateRequest(scenario=scenario_modified))
    # No peripheral buses should be moved to STOP_MAIN
    for move in alloc_res.recommended_moves:
        assert move.destination_stop_id != "STOP_MAIN"

    rejection_reasons = [r.constraint_violated for r in alloc_res.rejected_moves]
    assert "HARD_CONSTRAINT_ROUTE_COMPATIBILITY" in rejection_reasons


# =====================================================================
# TEST 5: A bus arriving after the peak is not recommended for that peak
# =====================================================================

def test_5_bus_arriving_after_peak_rejected(default_scenario):
    """Verifies that transit delay causing arrival after peak start triggers rejection."""
    scenario_modified = copy.deepcopy(default_scenario)
    # Set transit time between peripheral and main to 120 minutes (2 hours)
    scenario_modified.travel_time_matrix_minutes["STOP_PERIPHERAL"]["STOP_MAIN"] = 120

    alloc_res = allocate_fixed_fleet(AllocateRequest(scenario=scenario_modified))
    # With 120m travel time from 21:00 departure, arrival is 23:00, way after 21:30 peak!
    rejection_reasons = [r.constraint_violated for r in alloc_res.rejected_moves]
    assert "HARD_CONSTRAINT_PEAK_ARRIVAL_WINDOW" in rejection_reasons

    # No move from peripheral to main should be recommended
    for move in alloc_res.recommended_moves:
        assert not (move.source_stop_id == "STOP_PERIPHERAL" and move.destination_stop_id == "STOP_MAIN")


# =====================================================================
# TEST 6: Every proposed move has an explicit source-service impact
# =====================================================================

def test_6_explicit_source_service_impact(default_scenario):
    """Verifies that each recommended move explicitly details the exact impact on the donor stop."""
    alloc_res = allocate_fixed_fleet(AllocateRequest(scenario=default_scenario))
    assert len(alloc_res.recommended_moves) > 0, "Default scenario should generate safe reallocations"

    for move in alloc_res.recommended_moves:
        assert move.source_service_before > 0
        assert move.source_service_after >= 0
        assert move.source_service_before > move.source_service_after
        assert move.source_service_impact_description is not None
        assert len(move.source_service_impact_description.strip()) > 20
        # Check that source stop ID or name is explicitly mentioned in the description
        assert (move.source_stop_id in move.source_service_impact_description or
                "Source stop" in move.source_service_impact_description)
        assert move.delayed_or_unserved_passengers_at_source >= 0


# =====================================================================
# TEST 7: A move that violates minimum source service is rejected
# =====================================================================

def test_7_violating_minimum_source_service_rejected(default_scenario):
    """Verifies that moving a bus below min_service_buses is strictly prevented."""
    scenario_modified = copy.deepcopy(default_scenario)
    # Peripheral stop has 4 buses; set min_service_buses = 4 so none can be spared
    for s in scenario_modified.stops:
        if s.stop_id == "STOP_PERIPHERAL":
            s.min_service_buses = 4

    alloc_res = allocate_fixed_fleet(AllocateRequest(scenario=scenario_modified))
    rejection_reasons = [r.constraint_violated for r in alloc_res.rejected_moves]
    assert "HARD_CONSTRAINT_MINIMUM_SOURCE_SERVICE" in rejection_reasons

    for move in alloc_res.recommended_moves:
        assert move.source_stop_id != "STOP_PERIPHERAL"


# =====================================================================
# TEST 8: Missing source-service info prevents an unsafe recommendation
# =====================================================================

def test_8_missing_source_service_prevents_unsafe_recommendation(default_scenario):
    """Verifies that evaluate_candidate_move rejects candidates with unknown source stop info."""
    bus = default_scenario.fleet[0]
    move, rejection = evaluate_candidate_move(
        scenario=default_scenario,
        bus=bus,
        source_stop_id="STOP_UNKNOWN_UNREGISTERED",
        destination_stop_id="STOP_MAIN",
        departure_time_str="21:00",
        destination_peak_interval="21:30-21:45",
        destination_deficit=1000,
        current_source_buses_count=4,
        source_demand_est=100,
    )

    assert move is None
    assert rejection is not None
    assert rejection.constraint_violated == "HARD_CONSTRAINT_SOURCE_IMPACT_KNOWABILITY"


# =====================================================================
# TEST 9: No feasible move returns "No safe move"
# =====================================================================

def test_9_no_feasible_move_returns_no_safe_move(default_scenario):
    """Verifies that when all candidates violate constraints, system returns 'No safe move'."""
    scenario_modified = copy.deepcopy(default_scenario)
    # Lock down peripheral stop completely: all buses in maintenance
    for b in scenario_modified.fleet:
        if b.initial_stop_id == "STOP_PERIPHERAL":
            b.status = "maintenance"

    alloc_res = allocate_fixed_fleet(AllocateRequest(scenario=scenario_modified))
    assert alloc_res.status == "NO_SAFE_MOVE"
    assert len(alloc_res.recommended_moves) == 0
    assert "No safe move" in alloc_res.summary


# =====================================================================
# TEST 10: Invalid IDs, negative capacities, and invalid inputs are rejected
# =====================================================================

def test_10_invalid_inputs_rejected():
    """Verifies that Pydantic models strictly reject negative capacities, empty IDs, and invalid inputs."""
    # Negative bus capacity
    with pytest.raises(ValidationError):
        Bus(
            bus_id="BUS-TEST",
            initial_stop_id="STOP_MAIN",
            capacity=-50,
            status="available"
        )

    # Zero bus capacity
    with pytest.raises(ValidationError):
        Bus(
            bus_id="BUS-TEST",
            initial_stop_id="STOP_MAIN",
            capacity=0,
            status="available"
        )

    # Empty bus_id
    with pytest.raises(ValidationError):
        Bus(
            bus_id="   ",
            initial_stop_id="STOP_MAIN",
            capacity=60,
            status="available"
        )

    # Negative min_service_buses
    with pytest.raises(ValidationError):
        Stop(
            stop_id="STOP-TEST",
            name="Test Stop",
            min_service_buses=-1,
            baseline_scheduled_buses=5
        )

    # Duplicate bus IDs in ScenarioData
    valid_scenario = load_default_scenario()
    duplicate_fleet = list(valid_scenario.fleet)
    # Append duplicate bus
    duplicate_fleet.append(valid_scenario.fleet[0])
    scenario_dict = valid_scenario.model_dump()
    scenario_dict["fleet"].append(scenario_dict["fleet"][0])
    with pytest.raises(ValidationError):
        ScenarioData.model_validate(scenario_dict)


# =====================================================================
# TEST 11: Delaying final event shifts demand peak according to rules
# =====================================================================

def test_11_delaying_event_shifts_demand_peak():
    """Verifies that delaying the final event shifts the synthetic demand peak dynamically."""
    # Run 1: Event ends at 21:30
    fc_standard = generate_demand_forecast(
        ForecastRequest(scheduled_event_end_time_override="21:30")
    )
    main_summary_standard = fc_standard.stop_summaries["STOP_MAIN"]
    peak_standard = main_summary_standard.peak_interval

    # Run 2: Event ends at 22:00 (delayed by 30 mins)
    fc_delayed = generate_demand_forecast(
        ForecastRequest(scheduled_event_end_time_override="22:00")
    )
    main_summary_delayed = fc_delayed.stop_summaries["STOP_MAIN"]
    peak_delayed = main_summary_delayed.peak_interval

    assert peak_standard == "21:30-21:45"
    assert peak_delayed == "22:00-22:15"

    peak_std_start = parse_time_to_minutes(peak_standard.split("-")[0])
    peak_del_start = parse_time_to_minutes(peak_delayed.split("-")[0])
    assert peak_del_start > peak_std_start, "Delaying event must shift peak interval later in time"


# =====================================================================
# TEST 12: Baseline and proposed simulations use identical initial fleet & demand
# =====================================================================

def test_12_simulation_identical_initial_fleet_and_demand(default_scenario):
    """Verifies that comparative simulation holds starting conditions and arrivals strictly constant."""
    sim_res = compare_schedules(SimulateRequest(scenario=default_scenario))

    base_sim = sim_res.baseline_simulation
    prop_sim = sim_res.proposed_simulation

    # Identical total arrivals across the network
    assert base_sim.total_passengers_arrived == prop_sim.total_passengers_arrived
    assert base_sim.total_passengers_arrived > 0

    # Identical arrivals at each stop individually
    for stop_id in default_scenario.stops:
        s_id = stop_id.stop_id
        assert base_sim.stop_metrics[s_id].total_arrivals == prop_sim.stop_metrics[s_id].total_arrivals

    # Identical initial fleet count
    assert sim_res.initial_fleet_count == len(default_scenario.fleet)
    assert sim_res.fleet_audit.inventory_conserved is True

    # Same number of interval snapshots evaluated
    assert len(base_sim.interval_snapshots) == len(prop_sim.interval_snapshots)


# =====================================================================
# REGRESSION TEST: Custom Scenarios in Forecasting and Simulation
# =====================================================================

def test_custom_scenarios_in_forecasting_and_simulation():
    """Verifies that forecasting and simulation use the supplied scenario rather than the default."""
    custom_scenario = ScenarioData(
        scenario_metadata=ScenarioMetadata(
            scenario_id="SCN-CUSTOM-REGRESSION-01",
            title="Custom Regression Test Scenario",
        ),
        festival_programme=FestivalProgramme(
            event_name="Custom Festival Test",
            scheduled_event_end_time="19:00",
            time_horizon=TimeHorizon(
                start_time="18:30",
                end_time="20:30",
                interval_minutes=15,
            ),
            expected_total_attendance=10000,
            exiting_passenger_fraction=0.8,
            demand_distribution={
                "STOP_CUSTOM_A": 0.85,
                "STOP_CUSTOM_B": 0.15,
            },
        ),
        weather=WeatherScenario(condition="clear"),
        stops=[
            Stop(
                stop_id="STOP_CUSTOM_A",
                name="Custom Terminal A",
                min_service_buses=1,
                baseline_scheduled_buses=2,
                supported_routes=["ROUTE-A"],
            ),
            Stop(
                stop_id="STOP_CUSTOM_B",
                name="Custom Depot B",
                min_service_buses=1,
                baseline_scheduled_buses=3,
                supported_routes=["ROUTE-B", "ROUTE-A"],
            ),
        ],
        travel_time_matrix_minutes={
            "STOP_CUSTOM_A": {"STOP_CUSTOM_A": 0, "STOP_CUSTOM_B": 15},
            "STOP_CUSTOM_B": {"STOP_CUSTOM_A": 15, "STOP_CUSTOM_B": 0},
        },
        fleet=[
            Bus(
                bus_id="BUS-CUST-01",
                initial_stop_id="STOP_CUSTOM_A",
                capacity=60,
                status="available",
                compatible_stops=["STOP_CUSTOM_A", "STOP_CUSTOM_B"],
                compatible_routes=["ROUTE-A", "ROUTE-B"],
            ),
            Bus(
                bus_id="BUS-CUST-02",
                initial_stop_id="STOP_CUSTOM_A",
                capacity=65,
                status="available",
                compatible_stops=["STOP_CUSTOM_A", "STOP_CUSTOM_B"],
                compatible_routes=["ROUTE-A", "ROUTE-B"],
            ),
            Bus(
                bus_id="BUS-CUST-03",
                initial_stop_id="STOP_CUSTOM_B",
                capacity=60,
                status="available",
                compatible_stops=["STOP_CUSTOM_A", "STOP_CUSTOM_B"],
                compatible_routes=["ROUTE-A", "ROUTE-B"],
            ),
            Bus(
                bus_id="BUS-CUST-04",
                initial_stop_id="STOP_CUSTOM_B",
                capacity=60,
                status="available",
                compatible_stops=["STOP_CUSTOM_A", "STOP_CUSTOM_B"],
                compatible_routes=["ROUTE-A", "ROUTE-B"],
            ),
            Bus(
                bus_id="BUS-CUST-05",
                initial_stop_id="STOP_CUSTOM_B",
                capacity=60,
                status="available",
                compatible_stops=["STOP_CUSTOM_A", "STOP_CUSTOM_B"],
                compatible_routes=["ROUTE-A", "ROUTE-B"],
            ),
        ],
    )

    # 1. Forecasting with custom scenario
    fc_res = generate_demand_forecast(ForecastRequest(scenario=custom_scenario))
    assert fc_res.scenario_id == "SCN-CUSTOM-REGRESSION-01"
    assert set(fc_res.stop_summaries.keys()) == {"STOP_CUSTOM_A", "STOP_CUSTOM_B"}
    assert "STOP_MAIN" not in fc_res.stop_summaries
    # Total exiting passengers = 10000 * 0.8 = 8000
    total_custom_forecast = sum(s.total_demand for s in fc_res.stop_summaries.values())
    assert 7800 <= total_custom_forecast <= 8200

    # 2. Discrete simulation directly with custom scenario
    sim_direct = run_discrete_simulation(custom_scenario, moves=[], run_label="BASELINE_SCHEDULE")
    assert set(sim_direct.stop_metrics.keys()) == {"STOP_CUSTOM_A", "STOP_CUSTOM_B"}
    assert "STOP_MAIN" not in sim_direct.stop_metrics
    assert sim_direct.total_passengers_arrived == total_custom_forecast

    # 3. Schedule comparison with custom scenario
    cmp_res = compare_schedules(SimulateRequest(scenario=custom_scenario))
    assert cmp_res.scenario_id == "SCN-CUSTOM-REGRESSION-01"
    assert cmp_res.initial_fleet_count == 5
    assert set(cmp_res.baseline_simulation.stop_metrics.keys()) == {"STOP_CUSTOM_A", "STOP_CUSTOM_B"}
    assert set(cmp_res.proposed_simulation.stop_metrics.keys()) == {"STOP_CUSTOM_A", "STOP_CUSTOM_B"}
    assert cmp_res.fleet_audit.initial_fleet_count == 5
    assert cmp_res.fleet_audit.final_fleet_count == 5
    assert cmp_res.fleet_audit.inventory_conserved is True


# =====================================================================
# REGRESSION TEST: Capacity Consistency (60-seat and 65-seat buses)
# =====================================================================

def test_capacity_consistency_including_60_and_65_seat_buses(default_scenario):
    """Verifies that 15-minute boarding capacity is floor(capacity / 2) across all modules."""
    # 1. Direct formula tests
    assert calculate_interval_capacity(60) == 30
    assert calculate_interval_capacity(65) == 32
    assert calculate_interval_capacity(70) == 35

    # 2. Bus model interval_capacity property
    bus_60 = Bus(bus_id="BUS-60", initial_stop_id="STOP_MAIN", capacity=60)
    bus_65 = Bus(bus_id="BUS-65", initial_stop_id="STOP_MAIN", capacity=65)
    assert bus_60.interval_capacity == 30
    assert bus_65.interval_capacity == 32

    # 3. Trade-off candidate evaluation benefit:
    # 60-seat bus relocation benefit must be 30, not 60!
    move_60, _ = evaluate_candidate_move(
        scenario=default_scenario,
        bus=bus_60,
        source_stop_id="STOP_PERIPHERAL",
        destination_stop_id="STOP_MAIN",
        departure_time_str="21:00",
        destination_peak_interval="21:30-21:45",
        destination_deficit=1000,
        current_source_buses_count=4,
        source_demand_est=50,
    )
    assert move_60 is not None
    assert move_60.estimated_destination_benefit == 30
    assert "15-min capacity" in move_60.source_service_impact_description

    # 65-seat bus relocation benefit must be 32, not 65!
    move_65, _ = evaluate_candidate_move(
        scenario=default_scenario,
        bus=bus_65,
        source_stop_id="STOP_PERIPHERAL",
        destination_stop_id="STOP_MAIN",
        departure_time_str="21:00",
        destination_peak_interval="21:30-21:45",
        destination_deficit=1000,
        current_source_buses_count=4,
        source_demand_est=50,
    )
    assert move_65 is not None
    assert move_65.estimated_destination_benefit == 32
    assert "15-min capacity" in move_65.source_service_impact_description

    # 4. Forecast baseline capacity reflects individual bus capacities:
    # STOP_MAIN has 10 x 60-seat buses + 2 x 65-seat buses:
    # Expected 15-min capacity = (10 * 30) + (2 * 32) = 300 + 64 = 364
    # STOP_PERIPHERAL has 4 x 60-seat buses:
    # Expected 15-min capacity = 4 * 30 = 120
    fc = generate_demand_forecast(ForecastRequest(scenario=default_scenario))
    main_intervals = [i for i in fc.intervals if i.stop_id == "STOP_MAIN"]
    periph_intervals = [i for i in fc.intervals if i.stop_id == "STOP_PERIPHERAL"]
    for interval in main_intervals:
        assert interval.baseline_capacity == 364
    for interval in periph_intervals:
        assert interval.baseline_capacity == 120

    # Total baseline scheduled capacity over 8 intervals:
    assert fc.stop_summaries["STOP_MAIN"].baseline_scheduled_capacity == 364 * 8
    assert fc.stop_summaries["STOP_PERIPHERAL"].baseline_scheduled_capacity == 120 * 8


# =====================================================================
# REGRESSION TEST: Semantic Validation Rejects Invalid HH:MM Times
# =====================================================================

def test_semantic_validation_rejects_invalid_hh_mm_times():
    """Verifies that invalid times such as 99:99, 21:75, 24:00 and inverted ranges are rejected."""
    # 1. Invalid minute (> 59)
    with pytest.raises(ValidationError):
        TimeHorizon(start_time="21:75", end_time="22:00")

    # 2. Invalid hour (> 23)
    with pytest.raises(ValidationError):
        TimeHorizon(start_time="99:99", end_time="22:00")

    # 3. 24:00 is invalid in 24-hour HH:MM notation (00:00 to 23:59)
    with pytest.raises(ValidationError):
        TimeHorizon(start_time="24:00", end_time="25:00")

    # 4. Inverted time horizon range (start >= end)
    with pytest.raises(ValidationError):
        TimeHorizon(start_time="22:00", end_time="21:00")

    with pytest.raises(ValidationError):
        TimeHorizon(start_time="21:30", end_time="21:30")

    # 5. Invalid event end time in FestivalProgramme
    with pytest.raises(ValidationError):
        FestivalProgramme(
            event_name="Invalid Time Fest",
            scheduled_event_end_time="99:99",
            time_horizon=TimeHorizon(start_time="20:00", end_time="22:00"),
            expected_total_attendance=1000,
            exiting_passenger_fraction=0.5,
            demand_distribution={"STOP_MAIN": 1.0},
        )

    with pytest.raises(ValidationError):
        FestivalProgramme(
            event_name="Invalid Time Fest 2",
            scheduled_event_end_time="21:75",
            time_horizon=TimeHorizon(start_time="20:00", end_time="22:00"),
            expected_total_attendance=1000,
            exiting_passenger_fraction=0.5,
            demand_distribution={"STOP_MAIN": 1.0},
        )

    # 6. Invalid override in ForecastRequest
    with pytest.raises(ValidationError):
        ForecastRequest(scheduled_event_end_time_override="99:99")

    with pytest.raises(ValidationError):
        ForecastRequest(scheduled_event_end_time_override="21:75")

    # 7. Invalid parse_time_to_minutes
    with pytest.raises(ValueError):
        parse_time_to_minutes("99:99")

    with pytest.raises(ValueError):
        parse_time_to_minutes("21:75")

    with pytest.raises(ValueError):
        parse_time_to_minutes("24:00")


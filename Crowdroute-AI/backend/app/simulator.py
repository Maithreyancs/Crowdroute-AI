"""Simulation Engine for CrowdRoute AI.
Simulates passenger arrivals, queues, bus transit, boarding constraints,
and source-service impacts under identical synthetic baseline conditions.
Enables side-by-side comparison of baseline schedule vs proposed reallocation.
"""

from typing import Dict, List, Optional, Tuple, Any
from app.models import (
    AllocateRequest,
    Bus,
    BusMove,
    FleetAudit,
    ForecastRequest,
    IntervalSnapshot,
    ScenarioData,
    SimulateRequest,
    SimulateResponse,
    SimulationRunResult,
    StopSimulationSummary,
    calculate_interval_capacity,
)
from app.forecast import (
    generate_demand_forecast,
    load_default_scenario,
    parse_time_to_minutes,
    format_minutes_to_time,
)
from app.allocator import audit_fleet_conservation, allocate_fixed_fleet


def run_discrete_simulation(
    scenario: ScenarioData,
    moves: List[BusMove],
    run_label: str = "BASELINE_SCHEDULE",
) -> SimulationRunResult:
    """Executes a deterministic interval-based passenger and bus network simulation."""
    programme = scenario.festival_programme
    horizon = programme.time_horizon
    step_minutes = horizon.interval_minutes

    start_m = parse_time_to_minutes(horizon.start_time)
    end_m = parse_time_to_minutes(horizon.end_time)

    # 1. Fetch synthetic arrival profile from forecast
    forecast = generate_demand_forecast(ForecastRequest(scenario=scenario))
    arrivals_by_interval_stop: Dict[Tuple[int, str], int] = {}
    for item in forecast.intervals:
        arrivals_by_interval_stop[(item.interval_index, item.stop_id)] = item.central_estimate

    # 2. Build time intervals
    intervals: List[Tuple[int, int, str]] = []
    curr = start_m
    idx = 0
    while curr < end_m:
        nxt = min(curr + step_minutes, end_m)
        lbl = f"{format_minutes_to_time(curr)}-{format_minutes_to_time(nxt)}"
        intervals.append((curr, nxt, lbl))
        curr = nxt
        idx += 1

    # 3. Initialize bus states
    # Track position and transit status
    bus_state: Dict[str, Dict[str, Any]] = {}
    for b in scenario.fleet:
        bus_state[b.bus_id] = {
            "current_stop": b.initial_stop_id,
            "status": "at_stop" if b.status == "available" else "unavailable",
            "capacity": b.capacity,
            "transit_end_minute": 0,
            "transit_destination": None,
        }

    # Map relocations by departure minute and bus_id
    move_schedule: Dict[str, BusMove] = {m.bus_id: m for m in moves}

    # Stop state tracking
    stop_queues: Dict[str, int] = {s.stop_id: 0 for s in scenario.stops}
    stop_total_arrivals: Dict[str, int] = {s.stop_id: 0 for s in scenario.stops}
    stop_total_boarded: Dict[str, int] = {s.stop_id: 0 for s in scenario.stops}
    stop_peak_queue: Dict[str, int] = {s.stop_id: 0 for s in scenario.stops}
    stop_waiting_person_minutes: Dict[str, float] = {s.stop_id: 0.0 for s in scenario.stops}

    snapshots: List[IntervalSnapshot] = []

    # 4. Step through intervals
    for interval_idx, (interval_start_m, interval_end_m, interval_lbl) in enumerate(intervals):
        # A. Update in-transit buses that reach destination
        for b_id, b_info in bus_state.items():
            if b_info["status"] == "in_transit" and interval_start_m >= b_info["transit_end_minute"]:
                b_info["status"] = "at_stop"
                b_info["current_stop"] = b_info["transit_destination"]
                b_info["transit_destination"] = None

        # B. Trigger scheduled relocations scheduled at or before this interval start
        for b_id, move in move_schedule.items():
            dep_m = parse_time_to_minutes(move.departure_time)
            if interval_start_m <= dep_m < interval_end_m:
                b_info = bus_state[b_id]
                if b_info["status"] == "at_stop" and b_info["current_stop"] == move.source_stop_id:
                    arr_m = parse_time_to_minutes(move.estimated_arrival_time)
                    b_info["status"] = "in_transit"
                    b_info["current_stop"] = "IN_TRANSIT"
                    b_info["transit_end_minute"] = arr_m
                    b_info["transit_destination"] = move.destination_stop_id

        # C. For each stop, process arrivals and boarding
        for s in scenario.stops:
            s_id = s.stop_id
            arr = arrivals_by_interval_stop.get((interval_idx, s_id), 0)
            stop_total_arrivals[s_id] += arr

            queue_before = stop_queues[s_id]
            available_to_board = queue_before + arr

            # Count available buses at this stop
            stationed_buses = [
                b_id for b_id, info in bus_state.items()
                if info["status"] == "at_stop" and info["current_stop"] == s_id
            ]

            # In a 15-minute step, assume each stationed bus provides capacity = floor(capacity / 2)
            # (reflecting terminal boarding and regional round-trip cycles)
            interval_boarding_capacity = sum(
                calculate_interval_capacity(bus_state[b_id]["capacity"]) for b_id in stationed_buses
            )

            boarded = min(available_to_board, interval_boarding_capacity)
            queue_after = available_to_board - boarded

            stop_queues[s_id] = queue_after
            stop_total_boarded[s_id] += boarded
            stop_peak_queue[s_id] = max(stop_peak_queue[s_id], queue_after)

            # Accumulate waiting time
            # Boarded passengers waited avg 7.5 min; remaining queue waited full 15 min
            stop_waiting_person_minutes[s_id] += (boarded * (step_minutes / 2.0)) + (queue_after * step_minutes)

            # In-transit buses heading to or from this stop
            buses_in_transit_cnt = sum(
                1 for b_id, info in bus_state.items()
                if info["status"] == "in_transit" and (
                    info["transit_destination"] == s_id or move_schedule.get(b_id, None) and move_schedule[b_id].source_stop_id == s_id
                )
            )

            snapshots.append(
                IntervalSnapshot(
                    interval=interval_lbl,
                    stop_id=s_id,
                    arrivals=arr,
                    waiting_queue_start=queue_before,
                    boarded=boarded,
                    waiting_queue_end=queue_after,
                    active_buses=len(stationed_buses),
                    buses_in_transit=buses_in_transit_cnt,
                )
            )

    # 5. Compile stop summaries
    stop_summaries: Dict[str, StopSimulationSummary] = {}
    for s in scenario.stops:
        s_id = s.stop_id
        tot_arr = stop_total_arrivals[s_id]
        tot_brd = stop_total_boarded[s_id]
        pk_q = stop_peak_queue[s_id]
        unmet = max(0, tot_arr - tot_brd)
        avg_wait = round(stop_waiting_person_minutes[s_id] / max(1, tot_arr), 1)

        # Build service loss description
        moved_from_here = [m for m in moves if m.source_stop_id == s_id]
        moved_to_here = [m for m in moves if m.destination_stop_id == s_id]

        if moved_from_here:
            loss_desc = (
                f"{len(moved_from_here)} bus(es) relocated away ({', '.join(m.bus_id for m in moved_from_here)}). "
                f"Peak queue: {pk_q}, unmet demand: {unmet}. Baseline minimum service preserved."
            )
        elif moved_to_here:
            loss_desc = (
                f"Received {len(moved_to_here)} reinforcement bus(es) ({', '.join(m.bus_id for m in moved_to_here)}). "
                f"Relieved critical bottleneck; peak queue reached {pk_q}."
            )
        else:
            loss_desc = "Standard baseline schedule operated with no vehicle reassignments."

        stop_summaries[s_id] = StopSimulationSummary(
            stop_id=s_id,
            stop_name=s.name,
            total_arrivals=tot_arr,
            total_boarded=tot_brd,
            peak_queue=pk_q,
            unmet_demand=unmet,
            average_waiting_time_minutes=avg_wait,
            service_loss_summary=loss_desc,
        )

    sys_arrived = sum(stop_total_arrivals.values())
    sys_boarded = sum(stop_total_boarded.values())
    sys_unmet = max(0, sys_arrived - sys_boarded)
    sys_peak_q = max(stop_peak_queue.values())

    # Total potential fleet theoretical capacity
    total_fleet_capacity = sum(calculate_interval_capacity(b.capacity) for b in scenario.fleet) * len(intervals)
    utilization = round(min(1.0, sys_boarded / max(1, total_fleet_capacity)), 3)

    return SimulationRunResult(
        run_type="BASELINE_SCHEDULE" if run_label == "BASELINE_SCHEDULE" else "PROPOSED_ALLOCATION",
        total_passengers_arrived=sys_arrived,
        total_passengers_boarded=sys_boarded,
        system_unmet_demand=sys_unmet,
        system_peak_queue=sys_peak_q,
        bus_utilization_rate=utilization,
        stop_metrics=stop_summaries,
        interval_snapshots=snapshots,
    )


def compare_schedules(request: Optional[SimulateRequest] = None) -> SimulateResponse:
    """Executes side-by-side simulation comparing baseline schedule vs proposed allocation.
    
    Uses IDENTICAL starting conditions, fleet definitions, and arrival curves.
    """
    if request is None:
        request = SimulateRequest()

    scenario = request.scenario if request.scenario is not None else load_default_scenario()

    # Determine recommended moves
    if request.moves_override is not None:
        moves = request.moves_override
    else:
        alloc_res = allocate_fixed_fleet(AllocateRequest(scenario=scenario))
        moves = alloc_res.recommended_moves

    # Run Baseline (Zero relocations)
    baseline_run = run_discrete_simulation(
        scenario=scenario,
        moves=[],
        run_label="BASELINE_SCHEDULE",
    )

    # Run Proposed (With validated relocations)
    proposed_run = run_discrete_simulation(
        scenario=scenario,
        moves=moves,
        run_label="PROPOSED_ALLOCATION",
    )

    # Conduct fleet audit
    audit = audit_fleet_conservation(scenario.fleet, moves)

    # Build net comparison
    main_stop = "STOP_MAIN"
    periph_stop = "STOP_PERIPHERAL"

    main_base_q = baseline_run.stop_metrics.get(main_stop, None)
    main_prop_q = proposed_run.stop_metrics.get(main_stop, None)
    periph_base_q = baseline_run.stop_metrics.get(periph_stop, None)
    periph_prop_q = proposed_run.stop_metrics.get(periph_stop, None)

    net_comparison = {
        "system_additional_passengers_boarded": proposed_run.total_passengers_boarded - baseline_run.total_passengers_boarded,
        "system_unmet_demand_reduction": baseline_run.system_unmet_demand - proposed_run.system_unmet_demand,
        "main_hub_peak_queue_reduction": (
            (main_base_q.peak_queue - main_prop_q.peak_queue) if (main_base_q and main_prop_q) else 0
        ),
        "source_stop_peak_queue_increase": (
            (periph_prop_q.peak_queue - periph_base_q.peak_queue) if (periph_base_q and periph_prop_q) else 0
        ),
        "fleet_conservation_verified": audit.inventory_conserved,
        "relocated_buses_count": len(moves),
        "notes": (
            "Simulated metrics are purely synthetic estimates based on model rules. "
            "No real-world precision or performance guarantees are implied."
        ),
    }

    return SimulateResponse(
        scenario_id=scenario.scenario_metadata.scenario_id,
        disclaimer="SYNTHETIC DEMO ESTIMATE ONLY - Deterministic Simulation",
        initial_fleet_count=audit.initial_fleet_count,
        baseline_simulation=baseline_run,
        proposed_simulation=proposed_run,
        net_comparison=net_comparison,
        fleet_audit=audit,
    )

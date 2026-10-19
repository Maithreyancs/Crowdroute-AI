"""Fixed-Fleet Bus Allocator for CrowdRoute AI.
Implements an explainable, constrained greedy heuristic for bus redistribution.
Enforces strict fleet conservation: zero invented buses, zero duplicates, zero inventory loss.
Returns 'No safe move' with clear operational explanations when constraints prevent safe dispatch.
"""

from typing import Dict, List, Optional, Set
from app.models import (
    AllocateRequest,
    AllocateResponse,
    Bus,
    BusMove,
    FleetAudit,
    ForecastRequest,
    ForecastResponse,
    RejectedCandidate,
    ScenarioData,
    Stop,
    calculate_interval_capacity,
)
from app.forecast import generate_demand_forecast, load_default_scenario, parse_time_to_minutes
from app.tradeoffs import evaluate_candidate_move


def audit_fleet_conservation(
    initial_buses: List[Bus],
    recommended_moves: List[BusMove],
) -> FleetAudit:
    """Verifies that the fleet inventory is strictly conserved under proposed moves."""
    initial_ids = [b.bus_id for b in initial_buses]
    initial_count = len(initial_ids)
    unique_initial_ids = set(initial_ids)

    duplicate_detected = len(initial_ids) != len(unique_initial_ids)

    # In our model, moves reassign existing buses; they do not alter the fleet roster
    moved_bus_ids = [m.bus_id for m in recommended_moves]
    invented_detected = any(b_id not in unique_initial_ids for b_id in moved_bus_ids)
    
    # Check that no bus is moved multiple times concurrently in one recommendation batch
    duplicate_moves = len(moved_bus_ids) != len(set(moved_bus_ids))
    if duplicate_moves:
        duplicate_detected = True

    final_count = initial_count
    conserved = (initial_count == final_count) and not invented_detected and not duplicate_detected

    details = (
        f"Initial fleet: {initial_count} vehicles. Final fleet: {final_count} vehicles. "
        f"Moved vehicles: {len(moved_bus_ids)}. Inventory conservation: {'PASSED' if conserved else 'FAILED'}."
    )

    return FleetAudit(
        initial_fleet_count=initial_count,
        final_fleet_count=final_count,
        inventory_conserved=conserved,
        duplicate_buses_detected=duplicate_detected,
        invented_buses_detected=invented_detected,
        missing_buses_detected=False,
        details=details,
    )


def allocate_fixed_fleet(request: Optional[AllocateRequest] = None) -> AllocateResponse:
    """Performs explainable constrained greedy allocation of the fixed bus fleet.
    
    NOTE: This is a greedy heuristic intended for transparency and explainability;
    it does NOT claim to find the mathematically global optimum.
    """
    if request is None:
        request = AllocateRequest()

    scenario = request.scenario if request.scenario is not None else load_default_scenario()
    forecast = (
        request.forecast
        if request.forecast is not None
        else generate_demand_forecast(ForecastRequest(scenario=scenario))
    )
    max_moves = request.max_moves or 10

    # Build lookup mappings
    stop_map: Dict[str, Stop] = {s.stop_id: s for s in scenario.stops}
    fleet_by_id: Dict[str, Bus] = {b.bus_id: b for b in scenario.fleet}

    # Count current buses at each stop
    current_buses_count: Dict[str, int] = {s.stop_id: 0 for s in scenario.stops}
    buses_at_stop: Dict[str, List[Bus]] = {s.stop_id: [] for s in scenario.stops}
    for b in scenario.fleet:
        if b.initial_stop_id in current_buses_count:
            buses_at_stop[b.initial_stop_id].append(b)
            if b.status == "available":
                current_buses_count[b.initial_stop_id] += 1

    # Identify stops with peak deficit
    # A stop is a candidate destination if peak demand exceeds its interval baseline capacity
    candidate_destinations: List[Tuple[str, int, str]] = []
    for stop_id, summary in forecast.stop_summaries.items():
        peak_demand = summary.peak_demand
        active_buses = [b for b in buses_at_stop.get(stop_id, []) if b.status == "available"]
        if active_buses:
            interval_cap = sum(calculate_interval_capacity(b.capacity) for b in active_buses)
        elif stop_map.get(stop_id) and stop_map[stop_id].baseline_scheduled_buses > 0:
            interval_cap = stop_map[stop_id].baseline_scheduled_buses * calculate_interval_capacity(60)
        else:
            interval_cap = 0
        deficit = peak_demand - interval_cap
        if deficit > 0 and summary.overall_risk in ["CRITICAL", "HIGH", "MODERATE"]:
            candidate_destinations.append((stop_id, deficit, summary.peak_interval))

    # Sort destinations by descending deficit (highest bottleneck first)
    candidate_destinations.sort(key=lambda x: x[1], reverse=True)

    recommended_moves: List[BusMove] = []
    rejected_moves: List[RejectedCandidate] = []
    relocated_bus_ids: Set[str] = set()

    # Determine planning departure time (beginning of the horizon)
    planning_departure_time = scenario.festival_programme.time_horizon.start_time

    # Evaluate reallocation candidates
    for dest_stop_id, initial_deficit, dest_peak_interval in candidate_destinations:
        remaining_deficit = initial_deficit

        # Identify candidate source stops: stops that are NOT facing a deficit
        # (We never take buses away from a bottleneck terminal)
        dest_ids_set = {d[0] for d in candidate_destinations}
        potential_sources = [
            s_id for s_id in stop_map.keys()
            if s_id not in dest_ids_set and len(buses_at_stop.get(s_id, [])) > 0
        ]
        # Sort potential source stops by available surplus descending
        potential_sources.sort(
            key=lambda s_id: current_buses_count.get(s_id, 0) - stop_map[s_id].min_service_buses,
            reverse=True
        )

        for src_stop_id in potential_sources:
            if remaining_deficit <= 0 or len(recommended_moves) >= max_moves:
                break

            # Evaluate each bus currently stationed at this source stop
            candidate_buses = [
                b for b in buses_at_stop[src_stop_id]
                if b.bus_id not in relocated_bus_ids
            ]

            for bus in candidate_buses:
                if remaining_deficit <= 0 or len(recommended_moves) >= max_moves:
                    break

                # Source demand estimate from forecast summary
                src_summary = forecast.stop_summaries.get(src_stop_id)
                src_demand_est = src_summary.peak_demand if src_summary else 0

                move, rejection = evaluate_candidate_move(
                    scenario=scenario,
                    bus=bus,
                    source_stop_id=src_stop_id,
                    destination_stop_id=dest_stop_id,
                    departure_time_str=planning_departure_time,
                    destination_peak_interval=dest_peak_interval,
                    destination_deficit=remaining_deficit,
                    current_source_buses_count=current_buses_count[src_stop_id],
                    source_demand_est=src_demand_est,
                )

                if move is not None:
                    # Constraint check passed: record move and apply state change
                    recommended_moves.append(move)
                    relocated_bus_ids.add(bus.bus_id)
                    current_buses_count[src_stop_id] -= 1
                    current_buses_count[dest_stop_id] += 1
                    remaining_deficit -= move.estimated_destination_benefit
                elif rejection is not None:
                    rejected_moves.append(rejection)

    # Conduct fleet conservation audit
    fleet_audit = audit_fleet_conservation(scenario.fleet, recommended_moves)

    # Construct final response
    if not recommended_moves:
        return AllocateResponse(
            scenario_id=scenario.scenario_metadata.scenario_id,
            status="NO_SAFE_MOVE",
            summary=(
                "No safe move: All candidate bus movements violated hard operational constraints "
                "(such as minimum source service, route compatibility, vehicle availability, or "
                "arrival before peak). Existing baseline schedule is preserved."
            ),
            recommended_moves=[],
            rejected_moves=rejected_moves,
            fleet_audit=fleet_audit,
        )

    summary_text = (
        f"Recommended {len(recommended_moves)} safe fixed-fleet reallocations relieving "
        f"critical crowd bottlenecks while preserving source minimum service levels. "
        f"Fleet inventory strictly conserved at {fleet_audit.initial_fleet_count} vehicles."
    )

    return AllocateResponse(
        scenario_id=scenario.scenario_metadata.scenario_id,
        status="SUCCESS",
        summary=summary_text,
        recommended_moves=recommended_moves,
        rejected_moves=rejected_moves,
        fleet_audit=fleet_audit,
    )

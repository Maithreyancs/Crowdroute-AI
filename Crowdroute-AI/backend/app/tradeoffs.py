"""Trade-off Analysis Engine for CrowdRoute AI.
Evaluates and validates candidate bus reallocations against hard operational constraints.
Ensures every proposed move has an explicit source-service impact and that no
decisions rely on opaque or unquantified heuristics.
"""

from typing import Dict, List, Optional, Tuple
from app.models import (
    Bus,
    BusMove,
    RejectedCandidate,
    ScenarioData,
    Stop,
    calculate_interval_capacity,
)
from app.forecast import parse_time_to_minutes, format_minutes_to_time


def evaluate_candidate_move(
    scenario: ScenarioData,
    bus: Bus,
    source_stop_id: str,
    destination_stop_id: str,
    departure_time_str: str,
    destination_peak_interval: str,
    destination_deficit: int,
    current_source_buses_count: int,
    source_demand_est: int,
) -> Tuple[Optional[BusMove], Optional[RejectedCandidate]]:
    """Evaluates a candidate bus movement against all hard constraints.
    
    Returns:
        (BusMove, None) if all constraints pass.
        (None, RejectedCandidate) if any constraint fails.
    """
    candidate_id = f"CAND-{bus.bus_id}-{source_stop_id}-TO-{destination_stop_id}"
    stop_map: Dict[str, Stop] = {s.stop_id: s for s in scenario.stops}

    # -------------------------------------------------------------
    # HARD CONSTRAINT 1: Source-service knowability & completeness
    # (Requirement 6: Reject candidate if source-service impact cannot be calculated)
    # -------------------------------------------------------------
    if source_stop_id not in stop_map:
        return None, RejectedCandidate(
            candidate_id=candidate_id,
            bus_id=bus.bus_id,
            source_stop_id=source_stop_id,
            destination_stop_id=destination_stop_id,
            reason_rejected=f"Source stop '{source_stop_id}' is not registered in scenario stops. Source impact cannot be calculated.",
            constraint_violated="HARD_CONSTRAINT_SOURCE_IMPACT_KNOWABILITY",
        )

    if destination_stop_id not in stop_map:
        return None, RejectedCandidate(
            candidate_id=candidate_id,
            bus_id=bus.bus_id,
            source_stop_id=source_stop_id,
            destination_stop_id=destination_stop_id,
            reason_rejected=f"Destination stop '{destination_stop_id}' is not registered in scenario stops.",
            constraint_violated="HARD_CONSTRAINT_DESTINATION_VALIDITY",
        )

    source_stop = stop_map[source_stop_id]
    dest_stop = stop_map[destination_stop_id]

    # -------------------------------------------------------------
    # HARD CONSTRAINT 2: Bus operational availability
    # (Requirement 5.3: Unavailable buses cannot be moved)
    # -------------------------------------------------------------
    if bus.status != "available":
        return None, RejectedCandidate(
            candidate_id=candidate_id,
            bus_id=bus.bus_id,
            source_stop_id=source_stop_id,
            destination_stop_id=destination_stop_id,
            reason_rejected=f"Bus '{bus.bus_id}' has status '{bus.status}' (must be 'available' to relocate).",
            constraint_violated="HARD_CONSTRAINT_BUS_AVAILABILITY",
        )

    # -------------------------------------------------------------
    # HARD CONSTRAINT 3: Route compatibility
    # (Requirement 5.4: Check route compatibility)
    # -------------------------------------------------------------
    # A bus must have the destination stop in its compatible_stops list,
    # or have overlapping route codes if specified.
    if bus.compatible_stops and destination_stop_id not in bus.compatible_stops:
        return None, RejectedCandidate(
            candidate_id=candidate_id,
            bus_id=bus.bus_id,
            source_stop_id=source_stop_id,
            destination_stop_id=destination_stop_id,
            reason_rejected=f"Bus '{bus.bus_id}' is not compatible with destination stop '{destination_stop_id}'. Compatible stops: {bus.compatible_stops}",
            constraint_violated="HARD_CONSTRAINT_ROUTE_COMPATIBILITY",
        )

    # If destination has specific supported routes, ensure bus can serve at least one
    if dest_stop.supported_routes and bus.compatible_routes:
        common_routes = set(dest_stop.supported_routes).intersection(set(bus.compatible_routes))
        if not common_routes:
            return None, RejectedCandidate(
                candidate_id=candidate_id,
                bus_id=bus.bus_id,
                source_stop_id=source_stop_id,
                destination_stop_id=destination_stop_id,
                reason_rejected=f"Bus '{bus.bus_id}' has no matching routes with destination stop '{destination_stop_id}' (Bus routes: {bus.compatible_routes}, Stop routes: {dest_stop.supported_routes})",
                constraint_violated="HARD_CONSTRAINT_ROUTE_COMPATIBILITY",
            )

    # -------------------------------------------------------------
    # HARD CONSTRAINT 4: Travel time and arrival BEFORE peak demand
    # (Requirement 5.5: Check travel time and whether bus arrives before predicted peak)
    # -------------------------------------------------------------
    matrix = scenario.travel_time_matrix_minutes
    if source_stop_id not in matrix or destination_stop_id not in matrix[source_stop_id]:
        return None, RejectedCandidate(
            candidate_id=candidate_id,
            bus_id=bus.bus_id,
            source_stop_id=source_stop_id,
            destination_stop_id=destination_stop_id,
            reason_rejected=f"Missing transit matrix connection between '{source_stop_id}' and '{destination_stop_id}'.",
            constraint_violated="HARD_CONSTRAINT_TRAVEL_MATRIX_MISSING",
        )

    raw_travel_time = matrix[source_stop_id][destination_stop_id]
    effective_travel_time = int(math_ceil(raw_travel_time * scenario.weather.travel_time_multiplier))

    departure_minutes = parse_time_to_minutes(departure_time_str)
    arrival_minutes = departure_minutes + effective_travel_time
    arrival_time_str = format_minutes_to_time(arrival_minutes)

    # Destination peak interval is formatted as "HH:MM-HH:MM"
    if "-" in destination_peak_interval:
        peak_start_str = destination_peak_interval.split("-")[0]
        peak_start_minutes = parse_time_to_minutes(peak_start_str)
    else:
        peak_start_minutes = arrival_minutes

    if arrival_minutes > peak_start_minutes:
        return None, RejectedCandidate(
            candidate_id=candidate_id,
            bus_id=bus.bus_id,
            source_stop_id=source_stop_id,
            destination_stop_id=destination_stop_id,
            reason_rejected=(
                f"Bus arrives at {arrival_time_str} ({arrival_minutes}m), which is AFTER "
                f"destination peak demand start time {destination_peak_interval} ({peak_start_minutes}m). "
                f"Move would arrive too late to relieve the critical bottleneck."
            ),
            constraint_violated="HARD_CONSTRAINT_PEAK_ARRIVAL_WINDOW",
        )

    # -------------------------------------------------------------
    # HARD CONSTRAINT 5: Minimum required service at source stop
    # (Requirement 5.6 & 5.8: Check minimum required service at source stop)
    # -------------------------------------------------------------
    source_buses_after = current_source_buses_count - 1
    if source_buses_after < source_stop.min_service_buses:
        return None, RejectedCandidate(
            candidate_id=candidate_id,
            bus_id=bus.bus_id,
            source_stop_id=source_stop_id,
            destination_stop_id=destination_stop_id,
            reason_rejected=(
                f"Relocating bus '{bus.bus_id}' reduces source stop '{source_stop_id}' fleet "
                f"to {source_buses_after} buses, violating the minimum service threshold of "
                f"{source_stop.min_service_buses} buses."
            ),
            constraint_violated="HARD_CONSTRAINT_MINIMUM_SOURCE_SERVICE",
        )

    # -------------------------------------------------------------
    # HARD CONSTRAINT 6: Net benefit positive
    # (Requirement 5.8: Recommend only when net benefit is positive)
    # -------------------------------------------------------------
    bus_interval_cap = calculate_interval_capacity(bus.capacity)
    dest_benefit = bus_interval_cap
    # Check if source stop would be pushed into an unserved deficit
    remaining_source_capacity = source_buses_after * bus_interval_cap
    unserved_source_passengers = max(0, source_demand_est - remaining_source_capacity)

    # Net benefit is relieved destination deficit minus any new unserved passengers at source
    effective_dest_relief = min(dest_benefit, max(0, destination_deficit))
    net_benefit = effective_dest_relief - unserved_source_passengers

    if net_benefit <= 0:
        return None, RejectedCandidate(
            candidate_id=candidate_id,
            bus_id=bus.bus_id,
            source_stop_id=source_stop_id,
            destination_stop_id=destination_stop_id,
            reason_rejected=(
                f"Net benefit is non-positive ({net_benefit} passengers). Relieving destination "
                f"would create an equal or worse shortfall at source stop."
            ),
            constraint_violated="HARD_CONSTRAINT_NET_BENEFIT_POSITIVE",
        )

    # -------------------------------------------------------------
    # All Constraints Passed! Build structured BusMove
    # -------------------------------------------------------------
    source_service_before_cap = current_source_buses_count * bus_interval_cap
    source_service_after_cap = source_buses_after * bus_interval_cap

    source_impact_desc = (
        f"Source stop '{source_stop.name}' ({source_stop_id}) loses 1 bus (Bus {bus.bus_id}, capacity {bus.capacity}, 15-min capacity {bus_interval_cap}). "
        f"Scheduled fleet decreases from {current_source_buses_count} to {source_buses_after} buses "
        f"(15-min capacity {source_service_before_cap} -> {source_service_after_cap}). "
        f"Minimum safety requirement of {source_stop.min_service_buses} bus(es) is satisfied."
    )

    dest_need_desc = (
        f"Destination stop '{dest_stop.name}' ({destination_stop_id}) faces severe peak demand "
        f"deficit of {destination_deficit} passengers during interval {destination_peak_interval}."
    )

    constraints_passed = [
        "HARD_CONSTRAINT_SOURCE_IMPACT_KNOWABILITY: Source impact fully quantified",
        "HARD_CONSTRAINT_DESTINATION_VALIDITY: Destination verified in network",
        "HARD_CONSTRAINT_BUS_AVAILABILITY: Vehicle status confirmed available",
        "HARD_CONSTRAINT_ROUTE_COMPATIBILITY: Route and stop authorized for vehicle",
        f"HARD_CONSTRAINT_PEAK_ARRIVAL_WINDOW: Bus arrives at {arrival_time_str} ahead of peak {destination_peak_interval}",
        f"HARD_CONSTRAINT_MINIMUM_SOURCE_SERVICE: Source retains {source_buses_after} buses (min {source_stop.min_service_buses} required)",
        f"HARD_CONSTRAINT_NET_BENEFIT_POSITIVE: Net gain of +{net_benefit} passengers accommodated",
    ]

    assumptions = [
        f"Travel time: {effective_travel_time} mins (includes weather multiplier {scenario.weather.travel_time_multiplier:.2f}).",
        f"Standardized 15-minute boarding capacity assumption: floor({bus.capacity} / 2) = {bus_interval_cap} passengers per interval.",
        f"Source passenger demand for period estimated at {source_demand_est} passengers.",
    ]

    move = BusMove(
        bus_id=bus.bus_id,
        source_stop_id=source_stop_id,
        destination_stop_id=destination_stop_id,
        departure_time=departure_time_str,
        estimated_arrival_time=arrival_time_str,
        target_peak_interval=destination_peak_interval,
        destination_need_reason=dest_need_desc,
        estimated_destination_benefit=effective_dest_relief,
        source_service_before=current_source_buses_count,
        source_service_after=source_buses_after,
        source_service_impact_description=source_impact_desc,
        delayed_or_unserved_passengers_at_source=unserved_source_passengers,
        constraints_passed=constraints_passed,
        assumptions=assumptions,
        status="RECOMMENDED",
    )

    return move, None


def math_ceil(val: float) -> int:
    """Helper for ceiling calculation without extra imports."""
    import math
    return int(math.ceil(val))

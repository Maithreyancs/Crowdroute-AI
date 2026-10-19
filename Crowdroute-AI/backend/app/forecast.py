"""Demand Estimation Engine for CrowdRoute AI.
Provides an explainable, deterministic rule-based baseline estimating passenger
demand by stop and time interval based on festival schedule and weather.
NO deep-learning model trained on invented data.
"""

import json
import math
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from app.models import (
    DemandIntervalEstimate,
    ForecastRequest,
    ForecastResponse,
    ScenarioData,
    StopForecastSummary,
    calculate_interval_capacity,
)


DEFAULT_SCENARIO_PATH = Path(__file__).resolve().parent.parent / "data" / "demo_scenario.json"


def load_default_scenario() -> ScenarioData:
    """Loads and validates the default synthetic demo scenario from disk."""
    with open(DEFAULT_SCENARIO_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    return ScenarioData.model_validate(data)


def parse_time_to_minutes(time_str: str) -> int:
    """Converts HH:MM string to total minutes from 00:00 with semantic validation."""
    parts = time_str.strip().split(":")
    if len(parts) != 2:
        raise ValueError(f"Invalid time format '{time_str}'. Expected HH:MM.")
    try:
        h, m = int(parts[0]), int(parts[1])
    except ValueError:
        raise ValueError(f"Invalid non-integer time components in '{time_str}'.")
    if not (0 <= h <= 23):
        raise ValueError(f"Invalid hour '{h}' in '{time_str}'. Hours must be between 00 and 23.")
    if not (0 <= m <= 59):
        raise ValueError(f"Invalid minute '{m}' in '{time_str}'. Minutes must be between 00 and 59.")
    return h * 60 + m


def format_minutes_to_time(minutes: int) -> str:
    """Converts total minutes from 00:00 to HH:MM string."""
    h = (minutes // 60) % 24
    m = minutes % 60
    return f"{h:02d}:{m:02d}"


def calculate_egress_weights(
    intervals: List[Tuple[int, int]],
    event_end_minutes: int,
    concentration_factor: float = 1.0,
    base_sigma_minutes: float = 24.0,
) -> List[float]:
    """Calculates normalized passenger departure distribution weights across intervals.
    
    The departure surge follows a smooth egress curve centered shortly after
    the final event end time.
    If weather is rainy (concentration_factor > 1.0), sigma compresses,
    meaning crowds rush to exit within a narrower window around event finish.
    """
    # Peak egress begins right as the event concludes; midpoint of peak window is ~7.5 min after end
    peak_center = event_end_minutes + 7.5
    effective_sigma = max(8.0, base_sigma_minutes / max(0.2, concentration_factor))

    raw_weights = []
    for start_m, end_m in intervals:
        mid_m = (start_m + end_m) / 2.0
        # Gaussian decay around peak egress time
        diff = mid_m - peak_center
        w = math.exp(-0.5 * (diff / effective_sigma) ** 2)
        raw_weights.append(w)

    total_weight = sum(raw_weights)
    if total_weight <= 0:
        return [1.0 / len(intervals)] * len(intervals)
    return [w / total_weight for w in raw_weights]


def generate_demand_forecast(request: Optional[ForecastRequest] = None) -> ForecastResponse:
    """Generates an explainable demand forecast responding dynamically to user or historical data."""
    if request is None:
        request = ForecastRequest()

    scenario = request.scenario if request.scenario is not None else load_default_scenario()
    programme = scenario.festival_programme
    weather = scenario.weather

    # Apply optional request overrides
    event_end_str = request.scheduled_event_end_time_override or programme.scheduled_event_end_time
    if getattr(programme, "event_delay_minutes", 0) > 0 and not request.scheduled_event_end_time_override:
        end_m = (parse_time_to_minutes(event_end_str) + programme.event_delay_minutes) % 1440
        event_end_str = format_minutes_to_time(end_m)
    weather_cond = request.weather_condition_override or weather.condition
    total_attendance = request.attendance_override if request.attendance_override is not None else programme.expected_total_attendance

    # Validation in USER_DATA mode
    if request.operational_mode == "USER_DATA":
        if total_attendance <= 0:
            raise ValueError("User Data Mode validation error: expected_total_attendance must be strictly positive.")
        if not scenario.stops:
            raise ValueError("User Data Mode validation error: at least one stop must be defined in the scenario.")
        if not programme.demand_distribution:
            raise ValueError("User Data Mode validation error: stop-wise demand distribution cannot be empty.")

    # Compute weather factor
    if weather_cond == "heavy_rain":
        concentration_factor = 1.4
        scenario.weather.travel_time_multiplier = max(scenario.weather.travel_time_multiplier, 1.25)
    elif weather_cond in ("light_rain", "rainy"):
        concentration_factor = 1.2
        scenario.weather.travel_time_multiplier = max(scenario.weather.travel_time_multiplier, 1.15)
    elif weather_cond == "cloudy":
        concentration_factor = 1.05
    else:
        concentration_factor = 1.0
    scenario.weather.surge_concentration_factor = concentration_factor

    # Build time intervals
    horizon = programme.time_horizon
    start_minutes = parse_time_to_minutes(horizon.start_time)
    end_minutes = parse_time_to_minutes(horizon.end_time)
    step_minutes = horizon.interval_minutes

    time_slots: List[Tuple[int, int]] = []
    curr = start_minutes
    while curr < end_minutes:
        nxt = min(curr + step_minutes, end_minutes)
        time_slots.append((curr, nxt))
        curr = nxt

    event_end_minutes = parse_time_to_minutes(event_end_str)
    interval_weights = calculate_egress_weights(
        time_slots,
        event_end_minutes=event_end_minutes,
        concentration_factor=concentration_factor,
    )

    # Exiting passengers through transit
    total_transit_egress = int(total_attendance * programme.exiting_passenger_fraction)

    # Calculate baseline 15-minute boarding capacity per stop based on each bus's configured capacity.
    stop_interval_cap_map: Dict[str, int] = {s.stop_id: 0 for s in scenario.stops}
    fleet_assigned_stops = set()
    for b in scenario.fleet:
        if b.initial_stop_id in stop_interval_cap_map and b.status == "available":
            stop_interval_cap_map[b.initial_stop_id] += calculate_interval_capacity(b.capacity)
            fleet_assigned_stops.add(b.initial_stop_id)

    for s in scenario.stops:
        if s.stop_id not in fleet_assigned_stops and s.baseline_scheduled_buses > 0:
            stop_interval_cap_map[s.stop_id] = s.baseline_scheduled_buses * calculate_interval_capacity(60)

    # Historical Empirical Pattern Extraction (if provided)
    historical_by_interval_stop: Dict[Tuple[int, str], int] = {}
    historical_stop_totals: Dict[str, int] = {}
    use_historical = bool(request.historical_records)

    if use_historical and request.historical_records:
        for rec in request.historical_records:
            try:
                rec_m = parse_time_to_minutes(rec.time)
                for idx, (s_m, e_m) in enumerate(time_slots):
                    if s_m <= rec_m < e_m:
                        historical_by_interval_stop[(idx, rec.stop_id)] = (
                            historical_by_interval_stop.get((idx, rec.stop_id), 0) + rec.passengers
                        )
                        historical_stop_totals[rec.stop_id] = (
                            historical_stop_totals.get(rec.stop_id, 0) + rec.passengers
                        )
                        break
            except Exception:
                continue

    estimates: List[DemandIntervalEstimate] = []
    stop_total_demand: Dict[str, int] = {s.stop_id: 0 for s in scenario.stops}
    stop_peak_info: Dict[str, Tuple[str, int]] = {s.stop_id: ("", -1) for s in scenario.stops}

    for idx, (s_m, e_m) in enumerate(time_slots):
        start_str = format_minutes_to_time(s_m)
        end_str = format_minutes_to_time(e_m)
        interval_label = f"{start_str}-{end_str}"
        w_default = interval_weights[idx]

        for stop in scenario.stops:
            share = programme.demand_distribution.get(stop.stop_id, 0.0)
            stop_share_passengers = total_transit_egress * share

            stop_hist_tot = historical_stop_totals.get(stop.stop_id, 0)
            hist_interval_pax = historical_by_interval_stop.get((idx, stop.stop_id), 0)

            if use_historical and stop_hist_tot > 0:
                empirical_weight = hist_interval_pax / float(stop_hist_tot)
                central_est = int(round(stop_share_passengers * empirical_weight))
                prov = (
                    f"Historical empirical pattern: {share*100:.1f}% stop split, "
                    f"interval empirical weight={empirical_weight:.4f} ({hist_interval_pax}/{stop_hist_tot} pax). "
                    f"Attendance scaled to {total_attendance:,}. Weather={weather_cond}."
                )
            else:
                central_est = int(round(stop_share_passengers * w_default))
                prov = (
                    f"{'User-configured' if request.operational_mode == 'USER_DATA' else 'Synthetic rule-based'} estimate: "
                    f"{share*100:.1f}% stop split, weight={w_default:.4f} from egress curve centered at event end {event_end_str}. "
                    f"Weather={weather_cond} (concentration={concentration_factor:.1f})."
                )

            low_est = int(round(central_est * 0.85))
            high_est = int(round(central_est * 1.20))

            stop_total_demand[stop.stop_id] += central_est
            if central_est > stop_peak_info[stop.stop_id][1]:
                stop_peak_info[stop.stop_id] = (interval_label, central_est)

            # Baseline scheduled 15-minute capacity for this interval
            interval_cap = stop_interval_cap_map.get(stop.stop_id, 0)
            deficit = central_est - interval_cap

            # Risk classification
            if deficit > 500 or (interval_cap > 0 and central_est > 3 * interval_cap):
                risk = "CRITICAL"
            elif deficit > 100 or (interval_cap > 0 and central_est > 1.5 * interval_cap):
                risk = "HIGH"
            elif deficit > 0:
                risk = "MODERATE"
            else:
                risk = "LOW"

            estimates.append(
                DemandIntervalEstimate(
                    stop_id=stop.stop_id,
                    interval_index=idx,
                    start_time=start_str,
                    end_time=end_str,
                    low_estimate=low_est,
                    central_estimate=central_est,
                    high_estimate=high_est,
                    baseline_capacity=interval_cap,
                    deficit_surplus=deficit,
                    risk_level=risk,
                    provenance_note=prov,
                )
            )

    # Build stop summaries
    summaries: Dict[str, StopForecastSummary] = {}
    for stop in scenario.stops:
        tot = stop_total_demand[stop.stop_id]
        pk_int, pk_val = stop_peak_info[stop.stop_id]
        interval_cap = stop_interval_cap_map.get(stop.stop_id, 0)
        total_baseline_cap = interval_cap * len(time_slots)

        if pk_val > interval_cap * 2:
            overall_risk = "CRITICAL"
        elif pk_val > interval_cap:
            overall_risk = "HIGH"
        elif tot > total_baseline_cap:
            overall_risk = "MODERATE"
        else:
            overall_risk = "LOW"

        summaries[stop.stop_id] = StopForecastSummary(
            stop_id=stop.stop_id,
            total_demand=tot,
            peak_interval=pk_int,
            peak_demand=pk_val,
            baseline_scheduled_capacity=total_baseline_cap,
            overall_risk=overall_risk,
        )

    # Determine confidence indicator and data limitations
    if use_historical and historical_stop_totals:
        confidence_level = "HIGH"
        confidence_indicator = (
            f"Historical Empirical Fit (High Confidence): Calibrated from {len(request.historical_records or [])} "
            f"uploaded records across {len(historical_stop_totals)} stop(s)."
        )
        method_used = "Empirical historical distribution scaled by user festival attendance and weather conditions."
        data_limitations = [
            "Historical records represent past festival arrival distributions; anomalies may occur if local transit options changed.",
            "Historical timestamps were aggregated into 15-minute planning bins.",
            "Weather conditions modify egress intensity via surge concentration multipliers.",
        ]
        data_provenance = f"Empirical historical distribution model calibrated against {len(request.historical_records or [])} records."
    else:
        confidence_level = "PRELIMINARY_BASELINE"
        confidence_indicator = (
            "Preliminary Baseline (Synthetic/Assumed): Deterministic rule-based Gaussian egress curve "
            "(no empirical historical training data provided)."
        )
        method_used = "Deterministic rule-based Gaussian egress model over synthetic scenario data."
        data_limitations = [
            "No empirical historical passenger records were supplied for this run.",
            "Forecast assumes a symmetric departure surge centered at the scheduled event conclusion.",
            "All passenger counts are planning estimates and must not be used for direct safety-critical operations.",
        ]
        data_provenance = "Deterministic rule-based Gaussian egress model over synthetic scenario data."

    # Compute Actual vs Predicted (if historical data provided)
    actual_vs_predicted_summary = None
    if use_historical and request.historical_records:
        from app.historical import calculate_actual_vs_predicted
        actual_vs_predicted_summary = calculate_actual_vs_predicted(request.historical_records, estimates)

    assumptions = [
        f"Mode: {'User Data Mode' if request.operational_mode == 'USER_DATA' else 'Demo / Synthetic Mode'}.",
        f"Synthetic demand distribution: Total attendance assumed {total_attendance:,} people.",
        f"{programme.exiting_passenger_fraction*100:.0f}% of attendees leave via municipal transit network.",
        f"Event end time: {event_end_str}; egress curve standard deviation: {24.0/concentration_factor:.1f} minutes.",
        f"Weather mode: {weather_cond} with surge concentration factor {concentration_factor:.1f}.",
        "Standardized 15-minute boarding capacity assumption: floor(capacity / 2) passengers per bus per 15-min interval (e.g., 30 for 60-seat, 32 for 65-seat).",
        f"Confidence indicator: {confidence_indicator}.",
        "Demand estimates are strictly synthetic baselines for planning and comparison only.",
    ]

    return ForecastResponse(
        scenario_id=scenario.scenario_metadata.scenario_id,
        disclaimer=(
            "USER DATA MODE ESTIMATE ONLY - Not verified physical measurements"
            if request.operational_mode == "USER_DATA"
            else "SYNTHETIC DEMO DATA ONLY - Not real passenger measurements"
        ),
        event_end_time=event_end_str,
        weather_condition=weather_cond,
        intervals=estimates,
        stop_summaries=summaries,
        assumptions=assumptions,
        data_provenance=data_provenance,
        operational_mode=request.operational_mode,
        confidence_level=confidence_level,
        confidence_indicator=confidence_indicator,
        method_used=method_used,
        data_limitations=data_limitations,
        actual_vs_predicted=actual_vs_predicted_summary,
    )

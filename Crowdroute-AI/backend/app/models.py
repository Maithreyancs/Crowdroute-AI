"""Pydantic Models for CrowdRoute AI.
Strictly validates inputs, scenario definitions, forecasts, allocation trade-offs, and simulations.
"""

import re
from typing import Dict, List, Literal, Optional, Any
from pydantic import BaseModel, Field, field_validator, model_validator


# =====================================================================
# TIME & CAPACITY CONSTANTS AND HELPERS
# =====================================================================

TIME_HH_MM_REGEX = r"^(?:[01]\d|2[0-3]):[0-5]\d$"


def calculate_interval_capacity(bus_capacity: int) -> int:
    """Standardized 15-minute boarding capacity assumption: floor(capacity / 2).
    
    Assumes standard 30-minute regional roundtrip turnaround dispatch cycle
    (boarding, regional outbound transit, and return).
    - 60-seat bus: floor(60 / 2) = 30 passengers per 15-minute interval.
    - 65-seat bus: floor(65 / 2) = 32 passengers per 15-minute interval.
    """
    return bus_capacity // 2


def validate_hh_mm_string(v: Optional[str]) -> Optional[str]:
    """Validates semantic HH:MM 24-hour time string (00:00 to 23:59)."""
    if v is None:
        return None
    v = v.strip()
    match = re.match(r"^(\d{2}):(\d{2})$", v)
    if not match:
        raise ValueError(f"Invalid time format '{v}'. Expected format HH:MM with two-digit hour and minute.")
    hours, minutes = int(match.group(1)), int(match.group(2))
    if not (0 <= hours <= 23):
        raise ValueError(f"Invalid hour '{hours:02d}' in '{v}'. Hours must be between 00 and 23.")
    if not (0 <= minutes <= 59):
        raise ValueError(f"Invalid minute '{minutes:02d}' in '{v}'. Minutes must be between 00 and 59.")
    return f"{hours:02d}:{minutes:02d}"


# =====================================================================
# SCENARIO & FLEET DOMAIN MODELS
# =====================================================================

class Stop(BaseModel):
    stop_id: str = Field(..., min_length=1, description="Unique stop identifier")
    name: str = Field(..., min_length=1, description="Human readable name of the stop")
    description: str = Field(default="", description="Operational notes for the stop")
    min_service_buses: int = Field(..., ge=0, description="Minimum buses required to maintain baseline safety/service")
    baseline_scheduled_buses: int = Field(..., ge=0, description="Scheduled buses at baseline")
    supported_routes: List[str] = Field(default_factory=list, description="Permitted route codes at this stop")
    latitude: Optional[float] = Field(default=None, ge=-90.0, le=90.0, description="Configurable latitude coordinate")
    longitude: Optional[float] = Field(default=None, ge=-180.0, le=180.0, description="Configurable longitude coordinate")

    @field_validator("stop_id")
    @classmethod
    def validate_stop_id(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("stop_id cannot be empty or whitespace only")
        return v.strip()


class Bus(BaseModel):
    bus_id: str = Field(..., min_length=1, description="Unique bus inventory identifier")
    initial_stop_id: str = Field(..., min_length=1, description="Current depot/stop location")
    capacity: int = Field(..., gt=0, description="Passenger carrying capacity (must be strictly positive)")
    status: Literal["available", "maintenance", "in_transit", "offline"] = Field(
        default="available",
        description="Operational status of the bus"
    )
    compatible_stops: List[str] = Field(
        default_factory=list,
        description="List of stops this vehicle is authorized and equipped to serve"
    )
    compatible_routes: List[str] = Field(
        default_factory=list,
        description="List of route codes compatible with this vehicle"
    )

    @property
    def interval_capacity(self) -> int:
        """Returns standard 15-minute boarding capacity: floor(capacity / 2)."""
        return calculate_interval_capacity(self.capacity)

    @field_validator("bus_id")
    @classmethod
    def validate_bus_id(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("bus_id cannot be empty or whitespace only")
        return v.strip()


class TimeHorizon(BaseModel):
    start_time: str = Field(..., pattern=TIME_HH_MM_REGEX, description="Start time HH:MM (00:00 to 23:59)")
    end_time: str = Field(..., pattern=TIME_HH_MM_REGEX, description="End time HH:MM (00:00 to 23:59)")
    interval_minutes: int = Field(default=15, gt=0, le=60, description="Time step duration in minutes")

    @field_validator("start_time", "end_time")
    @classmethod
    def validate_horizon_times(cls, v: str) -> str:
        return validate_hh_mm_string(v)

    @model_validator(mode="after")
    def validate_horizon_range(self) -> "TimeHorizon":
        s_parts = self.start_time.split(":")
        e_parts = self.end_time.split(":")
        s_m = int(s_parts[0]) * 60 + int(s_parts[1])
        e_m = int(e_parts[0]) * 60 + int(e_parts[1])
        if s_m >= e_m:
            raise ValueError(
                f"Invalid time-horizon range: start_time ({self.start_time}) must be strictly earlier than end_time ({self.end_time})"
            )
        return self


class FestivalProgramme(BaseModel):
    event_name: str = Field(..., min_length=1)
    scheduled_event_end_time: str = Field(..., pattern=TIME_HH_MM_REGEX, description="Event conclusion HH:MM (00:00 to 23:59)")
    time_horizon: TimeHorizon
    expected_total_attendance: int = Field(..., ge=0, description="Total expected crowd attendance")
    exiting_passenger_fraction: float = Field(..., ge=0.0, le=1.0, description="Fraction exiting via transit")
    demand_distribution: Dict[str, float] = Field(
        ...,
        description="Share of departing passengers destined for each stop_id"
    )
    event_start_time: Optional[str] = Field(default="18:00", description="Event start time HH:MM")
    event_date: Optional[str] = Field(default="2026-11-26", description="Event start date YYYY-MM-DD")
    event_end_date: Optional[str] = Field(default="2026-11-26", description="Event conclusion date YYYY-MM-DD")
    event_delay_minutes: int = Field(default=0, ge=0, description="Announced or simulated delay in minutes")
    timezone: str = Field(default="Asia/Kolkata", description="Configured venue timezone")
    forecast_horizon_hours: int = Field(default=24, ge=1, le=72, description="Forecast window duration in hours")

    @field_validator("scheduled_event_end_time")
    @classmethod
    def validate_event_end(cls, v: str) -> str:
        return validate_hh_mm_string(v)

    @field_validator("demand_distribution")
    @classmethod
    def validate_distribution_keys(cls, v: Dict[str, float]) -> Dict[str, float]:
        for stop_id, val in v.items():
            if val < 0.0:
                raise ValueError(f"Demand share for {stop_id} cannot be negative")
        return v


class WeatherScenario(BaseModel):
    condition: Literal["clear", "cloudy", "rainy", "light_rain", "heavy_rain"] = Field(default="clear")
    surge_concentration_factor: float = Field(default=1.0, gt=0.0, description="Multiplier compressing surge into fewer intervals")
    travel_time_multiplier: float = Field(default=1.0, ge=1.0, description="Congestion/rain slowdown factor on travel time")
    notes: Optional[str] = Field(default="")
    source: Literal["manual_scenario", "live_open_meteo", "cached_open_meteo"] = Field(default="manual_scenario")
    temperature_c: Optional[float] = None
    rainfall_mm: Optional[float] = None
    precipitation_probability: Optional[int] = None
    last_updated: Optional[str] = None
    is_live: bool = Field(default=False)


class LiveWeatherResponse(BaseModel):
    status: Literal["LIVE", "CACHED", "UNAVAILABLE"]
    source: str = "Open-Meteo Weather API (Tiruvannamalai)"
    condition: Literal["clear", "cloudy", "light_rain", "rainy", "heavy_rain"]
    condition_description: str
    temperature_c: Optional[float] = None
    relative_humidity_pct: Optional[int] = None
    precipitation_mm: Optional[float] = None
    rain_mm: Optional[float] = None
    wind_speed_kmh: Optional[float] = None
    observation_time: Optional[str] = None
    last_updated: str
    latitude: float = 12.2253
    longitude: float = 79.0747
    timezone: str = "Asia/Kolkata"
    message: str
    is_live: bool


class ScenarioMetadata(BaseModel):
    scenario_id: str = Field(..., min_length=1)
    title: str = Field(..., min_length=1)
    data_nature: str = Field(default="SYNTHETIC DEMO DATA")
    disclaimer: str = Field(
        default="SYNTHETIC DEMO DATA ONLY. All passenger counts and fleet movements are simulated estimates."
    )
    created_for: str = Field(default="SAKTHI HACKFEST'26")
    configured_fleet_assumption: str = Field(
        default="Fixed fleet inventory. No buses added, deleted, or duplicated."
    )


class ScenarioData(BaseModel):
    scenario_metadata: ScenarioMetadata
    festival_programme: FestivalProgramme
    weather: WeatherScenario
    stops: List[Stop] = Field(..., min_length=1)
    travel_time_matrix_minutes: Dict[str, Dict[str, int]]
    fleet: List[Bus] = Field(..., min_length=1)

    @field_validator("fleet")
    @classmethod
    def validate_unique_buses(cls, buses: List[Bus]) -> List[Bus]:
        ids = [b.bus_id for b in buses]
        if len(ids) != len(set(ids)):
            raise ValueError("Duplicate bus_id found in fleet inventory definition")
        return buses


# =====================================================================
# DATA SOURCE, MODES & HISTORICAL DATA MODELS
# =====================================================================

DataSourceType = Literal["USER_MANUAL", "HISTORICAL_RECORDS", "LIVE_API", "SYNTHETIC_DEMO"]
OperationalMode = Literal["DEMO_SYNTHETIC", "USER_DATA"]


class HistoricalRecord(BaseModel):
    time: str = Field(..., pattern=TIME_HH_MM_REGEX, description="Time HH:MM (00:00 to 23:59)")
    stop_id: str = Field(..., min_length=1)
    passengers: int = Field(..., ge=0)

    @field_validator("time")
    @classmethod
    def validate_record_time(cls, v: str) -> str:
        return validate_hh_mm_string(v)

    @field_validator("stop_id")
    @classmethod
    def validate_stop_id_nonempty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("stop_id cannot be empty")
        return v.strip()


class HistoricalUploadResponse(BaseModel):
    filename: str
    status: Literal["SUCCESS", "PARTIAL_SUCCESS", "INVALID_FILE"]
    total_rows: int
    valid_rows: int
    invalid_rows_count: int
    detected_columns: List[str]
    column_mapping: Dict[str, str]
    stop_ids_found: List[str]
    total_passenger_count: int
    records: List[HistoricalRecord]
    validation_errors: List[str]
    data_provenance: str


class ActualVsPredictedInterval(BaseModel):
    interval: str
    stop_id: str
    actual: int
    predicted: int
    diff: int
    abs_diff: int
    percentage_error: float


class ActualVsPredictedSummary(BaseModel):
    overall_mae: float
    overall_mape: float
    intervals_compared: int
    interval_details: List[ActualVsPredictedInterval]


class LiveDataSourceStatus(BaseModel):
    source_name: str
    status: Literal["ONLINE", "OFFLINE", "UNAVAILABLE", "STALE"]
    is_available: bool
    last_updated: Optional[str] = None
    message: str
    data: Optional[Dict[str, Any]] = None


class LiveDataSummaryResponse(BaseModel):
    timestamp: str
    weather_feed: LiveDataSourceStatus
    bus_schedule_feed: LiveDataSourceStatus
    overall_status: str


class UserDataValidationResult(BaseModel):
    is_valid: bool
    mode: OperationalMode
    missing_fields: List[str]
    validation_errors: List[str]
    warnings: List[str]
    input_sources: Dict[str, DataSourceType]


# =====================================================================
# DEMAND FORECAST MODELS
# =====================================================================

class DemandIntervalEstimate(BaseModel):
    stop_id: str
    interval_index: int
    start_time: str
    end_time: str
    low_estimate: int
    central_estimate: int
    high_estimate: int
    baseline_capacity: int
    deficit_surplus: int
    risk_level: Literal["LOW", "MODERATE", "HIGH", "CRITICAL"]
    provenance_note: str


class StopForecastSummary(BaseModel):
    stop_id: str
    total_demand: int
    peak_interval: str
    peak_demand: int
    baseline_scheduled_capacity: int
    overall_risk: Literal["LOW", "MODERATE", "HIGH", "CRITICAL"]


class ForecastRequest(BaseModel):
    scenario: Optional[ScenarioData] = None
    scheduled_event_end_time_override: Optional[str] = Field(
        default=None,
        pattern=TIME_HH_MM_REGEX,
        description="Optional override for final event ending time (HH:MM)"
    )
    weather_condition_override: Optional[Literal["clear", "cloudy", "rainy", "light_rain", "heavy_rain"]] = None
    attendance_override: Optional[int] = Field(default=None, ge=0)
    operational_mode: OperationalMode = Field(default="DEMO_SYNTHETIC")
    historical_records: Optional[List[HistoricalRecord]] = Field(default=None)
    source_attribution: Optional[Dict[str, DataSourceType]] = Field(default=None)

    @field_validator("scheduled_event_end_time_override")
    @classmethod
    def validate_override_time(cls, v: Optional[str]) -> Optional[str]:
        return validate_hh_mm_string(v)


class ForecastResponse(BaseModel):
    scenario_id: str
    disclaimer: str = "SYNTHETIC DEMO DATA ONLY - Not real passenger measurements"
    event_end_time: str
    weather_condition: str
    intervals: List[DemandIntervalEstimate]
    stop_summaries: Dict[str, StopForecastSummary]
    assumptions: List[str]
    data_provenance: str
    operational_mode: OperationalMode = "DEMO_SYNTHETIC"
    confidence_level: Literal["HIGH", "MODERATE", "LOW", "PRELIMINARY_BASELINE"] = "PRELIMINARY_BASELINE"
    confidence_indicator: str = "Preliminary baseline: Synthetic rule-based model"
    method_used: str = "Deterministic rule-based Gaussian egress curve"
    data_limitations: List[str] = Field(default_factory=list)
    actual_vs_predicted: Optional[ActualVsPredictedSummary] = None


# =====================================================================
# ALLOCATION & TRADE-OFF MODELS
# =====================================================================

class BusMove(BaseModel):
    bus_id: str
    source_stop_id: str
    destination_stop_id: str
    departure_time: str = Field(..., pattern=TIME_HH_MM_REGEX)
    estimated_arrival_time: str = Field(..., pattern=TIME_HH_MM_REGEX)
    target_peak_interval: str
    destination_need_reason: str
    estimated_destination_benefit: int
    source_service_before: int
    source_service_after: int
    source_service_impact_description: str
    delayed_or_unserved_passengers_at_source: int
    constraints_passed: List[str]
    assumptions: List[str]
    status: Literal["RECOMMENDED", "REJECTED"] = "RECOMMENDED"

    @field_validator("departure_time", "estimated_arrival_time")
    @classmethod
    def validate_move_times(cls, v: str) -> str:
        return validate_hh_mm_string(v)


class RejectedCandidate(BaseModel):
    candidate_id: str
    bus_id: str
    source_stop_id: str
    destination_stop_id: str
    reason_rejected: str
    constraint_violated: str


class FleetAudit(BaseModel):
    initial_fleet_count: int
    final_fleet_count: int
    inventory_conserved: bool
    duplicate_buses_detected: bool
    invented_buses_detected: bool
    missing_buses_detected: bool
    details: str


class AllocateRequest(BaseModel):
    scenario: Optional[ScenarioData] = None
    forecast: Optional[ForecastResponse] = None
    max_moves: Optional[int] = Field(default=10, ge=1)


class AllocateResponse(BaseModel):
    scenario_id: str
    disclaimer: str = "SYNTHETIC DEMO ESTIMATE ONLY - Fixed Fleet Heuristic Allocation"
    status: Literal["SUCCESS", "NO_SAFE_MOVE"]
    summary: str
    recommended_moves: List[BusMove]
    rejected_moves: List[RejectedCandidate]
    fleet_audit: FleetAudit


# =====================================================================
# SIMULATION MODELS
# =====================================================================

class StopSimulationSummary(BaseModel):
    stop_id: str
    stop_name: str
    total_arrivals: int
    total_boarded: int
    peak_queue: int
    unmet_demand: int
    average_waiting_time_minutes: float
    service_loss_summary: str


class IntervalSnapshot(BaseModel):
    interval: str
    stop_id: str
    arrivals: int
    waiting_queue_start: int
    boarded: int
    waiting_queue_end: int
    active_buses: int
    buses_in_transit: int


class SimulationRunResult(BaseModel):
    run_type: Literal["BASELINE_SCHEDULE", "PROPOSED_ALLOCATION"]
    total_passengers_arrived: int
    total_passengers_boarded: int
    system_unmet_demand: int
    system_peak_queue: int
    bus_utilization_rate: float
    stop_metrics: Dict[str, StopSimulationSummary]
    interval_snapshots: List[IntervalSnapshot]


class SimulateRequest(BaseModel):
    scenario: Optional[ScenarioData] = None
    moves_override: Optional[List[BusMove]] = None


class SimulateResponse(BaseModel):
    scenario_id: str
    disclaimer: str = "SYNTHETIC DEMO ESTIMATE ONLY - Deterministic Simulation"
    initial_fleet_count: int
    baseline_simulation: SimulationRunResult
    proposed_simulation: SimulationRunResult
    net_comparison: Dict[str, Any]
    fleet_audit: FleetAudit


# =====================================================================
# PUBLIC COMPLAINTS & GRIEVANCE REPORTING MODELS
# =====================================================================

ComplaintCategory = Literal[
    "Overcrowding",
    "Bus Not Available",
    "Bus Delay",
    "Long Waiting Time",
    "Stop Facilities",
    "Other"
]

ComplaintStatus = Literal["Received", "Under Review", "Resolved"]


class ComplaintCreate(BaseModel):
    category: ComplaintCategory
    stop_id: str = Field(..., min_length=1, description="Bus stop ID or location name")
    description: str = Field(..., min_length=5, max_length=1000, description="Details of the transport issue")
    incident_time: Optional[str] = Field(default=None, description="Optional incident time (HH:MM or datetime)")
    contact_phone: Optional[str] = Field(default=None, max_length=30, description="Optional citizen phone for follow-up")
    contact_email: Optional[str] = Field(default=None, max_length=100, description="Optional citizen email for follow-up")

    @field_validator("stop_id", "description")
    @classmethod
    def validate_non_empty_strings(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Field cannot be empty or whitespace only")
        return v.strip()


class ComplaintResponse(BaseModel):
    reference_id: str
    category: ComplaintCategory
    stop_id: str
    description: str
    incident_time: Optional[str] = None
    status: ComplaintStatus = "Received"
    created_at: str
    resolution_notes: Optional[str] = None
    disclaimer: str = "DEMO CITIZEN PORTAL REPORT - For public transport demonstration purposes only."


class ComplaintPublicItem(BaseModel):
    reference_id: str
    category: ComplaintCategory
    stop_id: str
    description: str
    incident_time: Optional[str] = None
    status: ComplaintStatus
    created_at: str


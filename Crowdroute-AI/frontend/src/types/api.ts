/**
 * TypeScript Interfaces strictly mirroring backend/app/models.py Pydantic schemas.
 */

export type OperationalMode = 'DEMO_SYNTHETIC' | 'USER_DATA';
export type DataSourceType = 'USER_MANUAL' | 'HISTORICAL_RECORDS' | 'LIVE_API' | 'SYNTHETIC_DEMO';
export type WeatherCondition = 'clear' | 'cloudy' | 'rainy' | 'light_rain' | 'heavy_rain';
export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
export type BusStatus = 'available' | 'maintenance' | 'in_transit' | 'offline';

export interface Stop {
  stop_id: string;
  name: string;
  description: string;
  min_service_buses: number;
  baseline_scheduled_buses: number;
  supported_routes: string[];
  latitude?: number;
  longitude?: number;
}

export interface Bus {
  bus_id: string;
  initial_stop_id: string;
  capacity: number;
  status: BusStatus;
  compatible_stops: string[];
  compatible_routes: string[];
}

export interface TimeHorizon {
  start_time: string; // HH:MM
  end_time: string;   // HH:MM
  interval_minutes: number;
}

export interface FestivalProgramme {
  event_name: string;
  scheduled_event_end_time: string; // HH:MM
  time_horizon: TimeHorizon;
  expected_total_attendance: number;
  exiting_passenger_fraction: number;
  demand_distribution: Record<string, number>; // stop_id -> fraction
  event_start_time?: string;
  event_date?: string;
  event_end_date?: string;
  event_delay_minutes?: number;
  timezone?: string;
  forecast_horizon_hours?: number;
}

export interface WeatherScenario {
  condition: WeatherCondition;
  surge_concentration_factor: number;
  travel_time_multiplier: number;
  notes?: string;
  source?: 'manual_scenario' | 'live_open_meteo' | 'cached_open_meteo';
  temperature_c?: number;
  rainfall_mm?: number;
  precipitation_probability?: number;
  last_updated?: string;
  is_live?: boolean;
}

export interface LiveWeatherResponse {
  status: 'LIVE' | 'CACHED' | 'UNAVAILABLE';
  source: string;
  condition: WeatherCondition;
  condition_description: string;
  temperature_c?: number;
  relative_humidity_pct?: number;
  precipitation_mm?: number;
  rain_mm?: number;
  wind_speed_kmh?: number;
  observation_time?: string;
  last_updated: string;
  latitude: number;
  longitude: number;
  timezone: string;
  message: string;
  is_live: boolean;
}

export interface ScenarioMetadata {
  scenario_id: string;
  title: string;
  data_nature: string;
  disclaimer: string;
  created_for: string;
  configured_fleet_assumption: string;
}

export interface ScenarioData {
  scenario_metadata: ScenarioMetadata;
  festival_programme: FestivalProgramme;
  weather: WeatherScenario;
  stops: Stop[];
  travel_time_matrix_minutes: Record<string, Record<string, number>>;
  fleet: Bus[];
}

export interface HistoricalRecord {
  time: string; // HH:MM
  stop_id: string;
  passengers: number;
}

export interface HistoricalUploadResponse {
  filename: string;
  status: 'SUCCESS' | 'PARTIAL_SUCCESS' | 'INVALID_FILE';
  total_rows: number;
  valid_rows: number;
  invalid_rows_count: number;
  detected_columns: string[];
  column_mapping: Record<string, string>;
  stop_ids_found: string[];
  total_passenger_count: number;
  records: HistoricalRecord[];
  validation_errors: string[];
  data_provenance: string;
}

export interface ActualVsPredictedInterval {
  interval: string;
  stop_id: string;
  actual: number;
  predicted: number;
  diff: number;
  abs_diff: number;
  percentage_error: number;
}

export interface ActualVsPredictedSummary {
  overall_mae: number;
  overall_mape: number;
  intervals_compared: number;
  interval_details: ActualVsPredictedInterval[];
}

export interface LiveDataSourceStatus {
  source_name: string;
  status: 'ONLINE' | 'OFFLINE' | 'UNAVAILABLE' | 'STALE';
  is_available: boolean;
  last_updated: string | null;
  message: string;
  data?: Record<string, any>;
}

export interface LiveDataSummaryResponse {
  timestamp: string;
  weather_feed: LiveDataSourceStatus;
  bus_schedule_feed: LiveDataSourceStatus;
  overall_status: string;
}

export interface DemandIntervalEstimate {
  stop_id: string;
  interval_index: number;
  start_time: string;
  end_time: string;
  low_estimate: number;
  central_estimate: number;
  high_estimate: number;
  baseline_capacity: number;
  deficit_surplus: number;
  risk_level: RiskLevel;
  provenance_note: string;
}

export interface StopForecastSummary {
  stop_id: string;
  total_demand: number;
  peak_interval: string;
  peak_demand: number;
  baseline_scheduled_capacity: number;
  overall_risk: RiskLevel;
}

export interface ForecastRequest {
  scenario?: ScenarioData;
  scheduled_event_end_time_override?: string;
  weather_condition_override?: WeatherCondition;
  attendance_override?: number;
  operational_mode: OperationalMode;
  historical_records?: HistoricalRecord[] | null;
  source_attribution?: Record<string, DataSourceType>;
}

export interface ForecastResponse {
  scenario_id: string;
  disclaimer: string;
  event_end_time: string;
  weather_condition: string;
  intervals: DemandIntervalEstimate[];
  stop_summaries: Record<string, StopForecastSummary>;
  assumptions: string[];
  data_provenance: string;
  operational_mode: OperationalMode;
  confidence_level: 'HIGH' | 'MODERATE' | 'LOW' | 'PRELIMINARY_BASELINE';
  confidence_indicator: string;
  method_used: string;
  data_limitations: string[];
  actual_vs_predicted?: ActualVsPredictedSummary | null;
}

export interface BusMove {
  bus_id: string;
  source_stop_id: string;
  destination_stop_id: string;
  departure_time: string;
  estimated_arrival_time: string;
  target_peak_interval: string;
  destination_need_reason: string;
  estimated_destination_benefit: number;
  source_service_before: number;
  source_service_after: number;
  source_service_impact_description: string;
  delayed_or_unserved_passengers_at_source: number;
  constraints_passed: string[];
  assumptions: string[];
  status: 'RECOMMENDED' | 'REJECTED';
}

export interface RejectedCandidate {
  candidate_id: string;
  bus_id: string;
  source_stop_id: string;
  destination_stop_id: string;
  reason_rejected: string;
  constraint_violated: string;
}

export interface FleetAudit {
  initial_fleet_count: number;
  final_fleet_count: number;
  inventory_conserved: boolean;
  duplicate_buses_detected: boolean;
  invented_buses_detected: boolean;
  missing_buses_detected: boolean;
  details: string;
}

export interface AllocateRequest {
  scenario?: ScenarioData;
  forecast?: ForecastResponse;
  max_moves?: number;
}

export interface AllocateResponse {
  scenario_id: string;
  disclaimer: string;
  status: 'SUCCESS' | 'NO_SAFE_MOVE';
  summary: string;
  recommended_moves: BusMove[];
  rejected_moves: RejectedCandidate[];
  fleet_audit: FleetAudit;
}

export interface StopSimulationSummary {
  stop_id: string;
  stop_name: string;
  total_arrivals: number;
  total_boarded: number;
  peak_queue: number;
  unmet_demand: number;
  average_waiting_time_minutes: number;
  service_loss_summary: string;
}

export interface IntervalSnapshot {
  interval: string;
  stop_id: string;
  arrivals: number;
  waiting_queue_start: number;
  boarded: number;
  waiting_queue_end: number;
  active_buses: number;
  buses_in_transit: number;
}

export interface SimulationRunResult {
  run_type: 'BASELINE_SCHEDULE' | 'PROPOSED_ALLOCATION';
  total_passengers_arrived: number;
  total_passengers_boarded: number;
  system_unmet_demand: number;
  system_peak_queue: number;
  bus_utilization_rate: number;
  stop_metrics: Record<string, StopSimulationSummary>;
  interval_snapshots: IntervalSnapshot[];
}

export interface SimulateRequest {
  scenario?: ScenarioData;
  moves_override?: BusMove[];
}

export interface SimulateResponse {
  scenario_id: string;
  disclaimer: string;
  initial_fleet_count: number;
  baseline_simulation: SimulationRunResult;
  proposed_simulation: SimulationRunResult;
  net_comparison: {
    system_additional_passengers_boarded: number;
    system_unmet_demand_reduction: number;
    main_hub_peak_queue_reduction: number;
    source_stop_peak_queue_increase: number;
    net_improvement_verified: boolean;
  };
  fleet_audit: FleetAudit;
}

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
  hackathon: string;
  domain: string;
  supported_modes: string[];
  supported_data_sources: string[];
  disclaimer: string;
}

export interface UserDataValidationResult {
  is_valid: boolean;
  mode: OperationalMode;
  missing_fields: string[];
  validation_errors: string[];
  warnings: string[];
  input_sources: Record<string, DataSourceType>;
}

export type ComplaintCategory =
  | 'Overcrowding'
  | 'Bus Not Available'
  | 'Bus Delay'
  | 'Long Waiting Time'
  | 'Stop Facilities'
  | 'Other';

export type ComplaintStatus = 'Received' | 'Under Review' | 'Resolved';

export interface ComplaintCreate {
  category: ComplaintCategory;
  stop_id: string;
  description: string;
  incident_time?: string;
  contact_phone?: string;
  contact_email?: string;
}

export interface ComplaintResponse {
  reference_id: string;
  category: ComplaintCategory;
  stop_id: string;
  description: string;
  incident_time?: string;
  status: ComplaintStatus;
  created_at: string;
  resolution_notes?: string;
  disclaimer: string;
}

export interface ComplaintPublicItem {
  reference_id: string;
  category: ComplaintCategory;
  stop_id: string;
  description: string;
  incident_time?: string;
  status: ComplaintStatus;
  created_at: string;
}

export interface StopLocation {
  stop_id: string;
  name: string;
  lat: number;
  lng: number;
  is_synthetic_demo: boolean;
  notes?: string;
}

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Calendar,
  Clock,
  Users,
  Bus as BusIcon,
  CloudSun,
  MapPin,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sliders,
  Play,
  TrendingUp,
  ShieldCheck,
  Info,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  Bus,
  LiveWeatherResponse,
  ScenarioData,
  Stop,
  WeatherCondition,
  ForecastResponse,
  AllocateResponse,
} from '../types/api';
import { api } from '../services/api';
import {
  formatDateIST,
  formatDelayMinutes,
  formatTo12Hour,
  isValid24HourTime,
  isValidDateTimeRange,
  calculateDurationFromDateTimes,
} from '../utils/timeFormat';

export interface FestivalScenarioControlCenterProps {
  scenario: ScenarioData | null;
  forecast?: ForecastResponse | null;
  allocation?: AllocateResponse | null;
  onRunPrediction: (scenario: ScenarioData) => void;
  onResetDefaults: () => void;
  isUpdating?: boolean;
  isLoading?: boolean;
  hasRunInitialPrediction?: boolean;
  lastUpdateTimestamp?: string;
}

export const FestivalScenarioControlCenter: React.FC<FestivalScenarioControlCenterProps> = ({
  scenario,
  forecast,
  allocation,
  onRunPrediction,
  onResetDefaults,
  isUpdating = false,
  isLoading = false,
  hasRunInitialPrediction = true,
  lastUpdateTimestamp = '',
}) => {
  // Form state
  const [formData, setFormData] = useState<ScenarioData | null>(() => (scenario ? JSON.parse(JSON.stringify(scenario)) : null));
  const [liveWeather, setLiveWeather] = useState<LiveWeatherResponse | null>(null);
  const [isFetchingWeather, setIsFetchingWeather] = useState<boolean>(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showAdvancedFleetTable, setShowAdvancedFleetTable] = useState<boolean>(false);

  // Debounce reference for automatic recalculation on input change
  const debounceTimerRef = useRef<any>(null);
  const isInitialMount = useRef<boolean>(true);

  // Keep form data in sync with prop updates from parent
  useEffect(() => {
    if (scenario) {
      setFormData(JSON.parse(JSON.stringify(scenario)));
    }
  }, [scenario]);

  // Fetch live weather on mount
  useEffect(() => {
    let active = true;
    const fetchWeather = async () => {
      try {
        setIsFetchingWeather(true);
        setWeatherError(null);
        const data = await api.getLiveWeather(false);
        if (active) setLiveWeather(data);
      } catch (err: any) {
        if (active) setWeatherError(err.message || 'Live weather service unreachable');
      } finally {
        if (active) setIsFetchingWeather(false);
      }
    };
    fetchWeather();
    return () => {
      active = false;
    };
  }, []);

  // AUTOMATIC RECALCULATION PIPELINE (PHASE 4)
  // When formData changes after initial prediction, automatically trigger recalculation (debounced)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    if (!formData || !scenario || !hasRunInitialPrediction) return;
    if (JSON.stringify(formData) === JSON.stringify(scenario)) return;

    // Validate essential inputs before debounced submit
    const prog = formData.festival_programme;
    if (prog.expected_total_attendance <= 0) return;
    if (!isValid24HourTime(prog.scheduled_event_end_time)) return;
    if (!isValid24HourTime(prog.time_horizon.start_time)) return;
    if (!isValid24HourTime(prog.time_horizon.end_time)) return;

    const sharesTotal = Object.values(prog.demand_distribution).reduce((sum, v) => sum + v, 0) * 100;
    if (Math.abs(sharesTotal - 100) > 2.0) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      onRunPrediction(formData);
    }, 550);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [formData, scenario, hasRunInitialPrediction, onRunPrediction]);

  // UNCONDITIONAL TOP-LEVEL HOOK: Peak forecast demand calculation
  // Must execute on every render before any conditional return to prevent React hooks order mismatch
  const peakForecastDemand = useMemo(() => {
    if (forecast?.stop_summaries && Object.keys(forecast.stop_summaries).length > 0) {
      return Object.values(forecast.stop_summaries).reduce((max, s) => Math.max(max, s.peak_demand), 0);
    }
    const attendance = formData?.festival_programme.expected_total_attendance ?? scenario?.festival_programme.expected_total_attendance ?? 40000;
    const fraction = formData?.festival_programme.exiting_passenger_fraction ?? scenario?.festival_programme.exiting_passenger_fraction ?? 0.85;
    const pax = Math.round(attendance * fraction);
    return Math.round(pax * 0.35);
  }, [
    forecast,
    formData?.festival_programme.expected_total_attendance,
    formData?.festival_programme.exiting_passenger_fraction,
    scenario?.festival_programme.expected_total_attendance,
    scenario?.festival_programme.exiting_passenger_fraction,
  ]);

  // Loading fallback: STRICTLY returned only after ALL hooks have executed
  if (!formData) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-500 shadow-sm space-y-3">
        <RefreshCw className="w-6 h-6 animate-spin text-sky-600 mx-auto" />
        <p className="font-semibold text-slate-800">Loading Festival Scenario Control Center...</p>
      </div>
    );
  }

  const prog = formData.festival_programme;
  const weather = formData.weather;

  // Handlers for inputs
  const handleProgChange = (field: string, value: any) => {
    setValidationError(null);
    setFormData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        festival_programme: {
          ...prev.festival_programme,
          [field]: value,
        },
      };
    });
  };

  const handleHorizonChange = (field: string, value: any) => {
    setValidationError(null);
    setFormData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        festival_programme: {
          ...prev.festival_programme,
          time_horizon: {
            ...prev.festival_programme.time_horizon,
            [field]: value,
          },
        },
      };
    });
  };

  const handleWeatherChange = (source: 'manual_scenario' | 'live_open_meteo', condition: WeatherCondition) => {
    setValidationError(null);
    setFormData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        weather: {
          ...prev.weather,
          source,
          condition,
          is_live: source === 'live_open_meteo',
          temperature_c: liveWeather?.temperature_c,
          rainfall_mm: liveWeather?.rain_mm ?? liveWeather?.precipitation_mm ?? 0,
          last_updated: liveWeather?.last_updated,
        },
      };
    });
  };

  const handleRefreshLiveWeather = async () => {
    setIsFetchingWeather(true);
    setWeatherError(null);
    try {
      const data = await api.getLiveWeather(true);
      setLiveWeather(data);
      if (formData.weather.source === 'live_open_meteo') {
        handleWeatherChange('live_open_meteo', data.condition);
      }
    } catch (err: any) {
      setWeatherError(err.message || 'Failed to update live weather.');
    } finally {
      setIsFetchingWeather(false);
    }
  };

  const handleApplyLiveWeather = () => {
    if (!liveWeather) return;
    handleWeatherChange('live_open_meteo', liveWeather.condition);
  };

  const handleShareChange = (stopId: string, percentage: number) => {
    const fraction = percentage / 100;
    setFormData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        festival_programme: {
          ...prev.festival_programme,
          demand_distribution: {
            ...prev.festival_programme.demand_distribution,
            [stopId]: fraction,
          },
        },
      };
    });
  };

  const handleBusStatusToggle = (busId: string, newStatus: 'available' | 'maintenance' | 'offline') => {
    setFormData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        fleet: prev.fleet.map((b) => (b.bus_id === busId ? { ...b, status: newStatus } : b)),
      };
    });
  };

  // Load Demonstrable Example Scenario: 11 October 2026, 6:00 PM - 10:00 PM IST, 40,000 attendees
  const handleLoadDemoScenario = () => {
    if (!formData) return;
    const demo: ScenarioData = {
      ...formData,
      festival_programme: {
        event_name: 'Festival Egress Demo',
        event_date: '2026-10-11',
        event_end_date: '2026-10-11',
        event_start_time: '18:00',
        scheduled_event_end_time: '22:00',
        event_delay_minutes: 0,
        timezone: 'Asia/Kolkata',
        forecast_horizon_hours: 24,
        time_horizon: {
          start_time: '21:00',
          end_time: '23:30',
          interval_minutes: 15,
        },
        expected_total_attendance: 40000,
        exiting_passenger_fraction: 0.85,
        demand_distribution: {
          STOP_MAIN: 0.60,
          STOP_PERIPHERAL: 0.25,
          STOP_EAST_GATE: 0.15,
        },
      },
      weather: {
        condition: 'clear',
        surge_concentration_factor: 1.0,
        travel_time_multiplier: 1.0,
        source: 'manual_scenario',
        notes: 'Illustrative Festival Egress Demo schedule (11 Oct 2026, 6:00-10:00 PM IST)',
      },
    };
    setFormData(demo);
    onRunPrediction(demo);
  };

  // Explicit Run Prediction click
  const handleManualRun = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (prog.expected_total_attendance <= 0) {
      setValidationError('Expected attendance must be greater than zero.');
      return;
    }
    const sharesTotal = Object.values(prog.demand_distribution).reduce((sum, v) => sum + v, 0) * 100;
    if (Math.abs(sharesTotal - 100) > 2.0) {
      setValidationError(`Stop demand shares must sum to 100% (currently ${sharesTotal.toFixed(1)}%).`);
      return;
    }
    setValidationError(null);
    onRunPrediction(formData);
  };

  // Calculations for display
  const totalFleet = formData.fleet.length;
  const availableBuses = formData.fleet.filter((b) => b.status === 'available').length;
  const unavailableBuses = totalFleet - availableBuses;

  const totalTransitPax = Math.round(prog.expected_total_attendance * prog.exiting_passenger_fraction);
  const sharesSum = Object.values(prog.demand_distribution).reduce((sum, v) => sum + v, 0) * 100;
  const isSharesSumValid = Math.abs(sharesSum - 100) < 1.5;

  // Peak forecast demand is computed unconditionally at the top level to adhere to React Rules of Hooks.

  // Standard interval capacity ~ 30 passengers per bus per 15-minute window
  const estimatedBusesRequired = Math.max(1, Math.ceil(peakForecastDemand / 30));
  const busSurplusOrShortage = availableBuses - estimatedBusesRequired;

  // Midnight crossing validation
  const isDurationValid = isValidDateTimeRange(
    prog.event_date,
    prog.event_start_time,
    prog.event_end_date || prog.event_date,
    prog.scheduled_event_end_time
  );
  const durationMinutes = calculateDurationFromDateTimes(
    prog.event_date,
    prog.event_start_time,
    prog.event_end_date || prog.event_date,
    prog.scheduled_event_end_time
  );

  return (
    <div id="scenario-control" className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 sm:p-7 space-y-6">
      
      {/* 1. CONTROL CENTER HEADER WITH DEMO PRESET & RECALCULATE STATE */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 pb-5 border-b border-slate-200">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse"></span>
            <span className="text-xs font-bold text-sky-700 uppercase tracking-wider font-mono">
              FESTIVAL OPERATIONS DESK
            </span>
            {isUpdating || isLoading ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-800 text-[11px] font-bold animate-pulse">
                <RefreshCw className="w-3 h-3 animate-spin text-sky-600" />
                <span>Updating Prediction...</span>
              </span>
            ) : hasRunInitialPrediction ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                <span>Up to Date ({lastUpdateTimestamp || 'IST'})</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[11px] font-bold">
                <AlertTriangle className="w-3 h-3 text-amber-600" />
                <span>Prediction Not Run Yet</span>
              </span>
            )}
          </div>
          <h2 className="font-heading text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Festival Scenario Control Center
          </h2>
          <p className="text-xs sm:text-sm text-slate-600">
            Define festival hours, attendee transport demand, real-time meteorological conditions, and fleet availability.
          </p>
        </div>

        {/* TOP ACTION BUTTONS */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleLoadDemoScenario}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-300 text-xs font-bold shadow-sm transition-all hover:scale-[1.02]"
            title="Load illustrative 11 October 2026 40,000 attendee scenario"
          >
            <Sparkles className="w-3.5 h-3.5 text-sky-600" />
            <span>Load Demo Scenario</span>
          </button>

          <button
            type="button"
            onClick={onResetDefaults}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-semibold shadow-sm transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
            <span>Reset Defaults</span>
          </button>
        </div>
      </div>

      {/* VALIDATION ERROR BANNER */}
      {validationError && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-center gap-2 font-medium">
          <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
          <span>{validationError}</span>
        </div>
      )}

      {/* 2. THE 4 RESPONSIVE SCENARIO CARDS (PHASE 2 A, B, C, D) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ---------------- CARD A: EVENT INFORMATION ---------------- */}
        <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-5 space-y-4 hover:border-sky-300 transition-all">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <div className="flex items-center gap-2 text-xs font-bold text-sky-800 uppercase tracking-wider font-mono">
              <Calendar className="w-4 h-4 text-sky-600" />
              <span>A. Event Information & Schedule (IST)</span>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">Asia/Kolkata</span>
          </div>

          <div className="space-y-3 text-xs">
            {/* Event Name */}
            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Event or Festival Name
              </label>
              <input
                type="text"
                value={prog.event_name}
                onChange={(e) => handleProgChange('event_name', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-sky-500"
                placeholder="e.g. Festival Egress Demo"
                required
              />
            </div>

            {/* Date & Location */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Event Date
                </label>
                <input
                  type="date"
                  value={prog.event_date || '2026-10-11'}
                  onChange={(e) => handleProgChange('event_date', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <span className="text-[11px] text-slate-500 mt-0.5 block">
                  {formatDateIST(prog.event_date || '2026-10-11')}
                </span>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Venue / Location
                </label>
                <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-slate-100 text-slate-700 text-xs">
                  <MapPin className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" />
                  <span className="truncate">Tiruvannamalai, Tamil Nadu</span>
                </div>
                <span className="text-[11px] text-slate-500 mt-0.5 block">
                  12.2253° N, 79.0747° E
                </span>
              </div>
            </div>

            {/* Start and End Times with 12-Hour IST formatting */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="font-semibold text-slate-700">
                    Event Start Time
                  </label>
                  <span className="px-1.5 py-0.2 rounded bg-sky-100 text-sky-800 font-bold font-mono text-[10px]">
                    {formatTo12Hour(prog.event_start_time || '18:00')} IST
                  </span>
                </div>
                <input
                  type="text"
                  pattern="^(?:[01]\d|2[0-3]):[0-5]\d$"
                  value={prog.event_start_time || '18:00'}
                  onChange={(e) => handleProgChange('event_start_time', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-sky-500"
                  placeholder="18:00"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="font-semibold text-slate-700">
                    Event End Time
                  </label>
                  <span className="px-1.5 py-0.2 rounded bg-sky-100 text-sky-800 font-bold font-mono text-[10px]">
                    {formatTo12Hour(prog.scheduled_event_end_time)} IST
                  </span>
                </div>
                <input
                  type="text"
                  pattern="^(?:[01]\d|2[0-3]):[0-5]\d$"
                  value={prog.scheduled_event_end_time}
                  onChange={(e) => handleProgChange('scheduled_event_end_time', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-sky-500"
                  placeholder="22:00"
                  required
                />
              </div>
            </div>

            {/* Delay in Minutes & Duration Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Event Delay (Minutes)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    step="5"
                    value={prog.event_delay_minutes || 0}
                    onChange={(e) => handleProgChange('event_delay_minutes', Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-24 px-3 py-1.5 rounded-lg border border-slate-300 bg-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  <div className="flex items-center gap-1">
                    {[0, 15, 30, 45].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => handleProgChange('event_delay_minutes', d)}
                        className={`px-2 py-1 rounded text-[10px] font-semibold font-mono border transition-all ${
                          prog.event_delay_minutes === d
                            ? 'bg-sky-600 text-white border-sky-600'
                            : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        +{d}m
                      </button>
                    ))}
                  </div>
                </div>
                <span className="text-[11px] text-slate-500 mt-1 block">
                  {formatDelayMinutes(prog.event_delay_minutes)}
                </span>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Estimated Event Duration
                </label>
                <div className="p-2 rounded-lg bg-white border border-slate-200 text-slate-800 text-xs font-mono">
                  {durationMinutes != null ? `${Math.floor(durationMinutes / 60)} hrs ${durationMinutes % 60} mins` : 'Flexible / Multiday'}
                  <span className="text-[10px] text-slate-500 block font-sans">
                    {isDurationValid ? 'Valid chronological schedule' : 'Crosses midnight into next day'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ---------------- CARD B: CROWD & PASSENGER DEMAND ---------------- */}
        <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-5 space-y-4 hover:border-sky-300 transition-all">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <div className="flex items-center gap-2 text-xs font-bold text-sky-800 uppercase tracking-wider font-mono">
              <Users className="w-4 h-4 text-sky-600" />
              <span>B. Crowd and Passenger Demand</span>
            </div>
            <span className="text-[11px] font-bold font-mono px-2 py-0.5 rounded bg-blue-100 text-blue-900">
              ~{totalTransitPax.toLocaleString()} Bus Pax
            </span>
          </div>

          <div className="space-y-3 text-xs">
            {/* Total Attendees and Transit Fraction */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Total Expected Attendees
                </label>
                <input
                  type="number"
                  min="1000"
                  step="1000"
                  value={prog.expected_total_attendance}
                  onChange={(e) => handleProgChange('expected_total_attendance', Math.max(100, parseInt(e.target.value) || 0))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white font-mono text-sm font-bold focus:outline-none focus:ring-2 focus:ring-sky-500"
                  required
                />
                <span className="text-[11px] text-slate-500 mt-0.5 block">
                  Illustrative sample: 40,000 attendees
                </span>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Transit-Use Fraction (% exiting by bus)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="0.10"
                    max="1.00"
                    step="0.05"
                    value={prog.exiting_passenger_fraction}
                    onChange={(e) => handleProgChange('exiting_passenger_fraction', parseFloat(e.target.value))}
                    className="flex-1"
                  />
                  <span className="font-mono font-bold text-xs w-12 text-right">
                    {(prog.exiting_passenger_fraction * 100).toFixed(0)}%
                  </span>
                </div>
                <span className="text-[11px] text-slate-500 mt-0.5 block">
                  Expected transit share of departing crowd
                </span>
              </div>
            </div>

            {/* Formula Card */}
            <div className="bg-sky-50 border border-sky-200 rounded-lg p-2.5 text-[11px] text-sky-950 space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-sky-900">
                <Info className="w-3.5 h-3.5 text-sky-600" />
                <span>Demand Formula (Operational Estimate):</span>
              </div>
              <p className="font-mono text-slate-700">
                Estimated Transit Passengers = {prog.expected_total_attendance.toLocaleString()} attendees × {(prog.exiting_passenger_fraction * 100).toFixed(0)}% = <strong className="text-sky-900">{totalTransitPax.toLocaleString()} passengers</strong>
              </p>
            </div>

            {/* Demand Distribution by Bus Stand */}
            <div className="space-y-2 pt-1">
              <div className="flex justify-between items-center">
                <label className="font-semibold text-slate-700">
                  Demand Distribution by Bus Stop
                </label>
                <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded border ${
                  isSharesSumValid
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : 'bg-amber-50 text-amber-800 border-amber-300'
                }`}>
                  Sum: {sharesSum.toFixed(1)}% {isSharesSumValid ? '✓' : '(Must be 100%)'}
                </span>
              </div>

              <div className="space-y-1.5">
                {formData.stops.map((stop) => {
                  const sharePct = (prog.demand_distribution[stop.stop_id] || 0) * 100;
                  const estStopPax = Math.round(totalTransitPax * (prog.demand_distribution[stop.stop_id] || 0));
                  return (
                    <div key={stop.stop_id} className="flex items-center justify-between gap-3 bg-white p-2 rounded-lg border border-slate-200">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-slate-900 truncate">
                          {stop.name}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {stop.stop_id} • Est. {estStopPax.toLocaleString()} pax
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          value={Math.round(sharePct)}
                          onChange={(e) => handleShareChange(stop.stop_id, parseFloat(e.target.value) || 0)}
                          className="w-16 px-2 py-1 rounded border border-slate-300 font-mono text-right text-xs"
                        />
                        <span className="text-slate-500 font-mono">%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Forecast Horizon Times */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Forecast Window Start
                </label>
                <input
                  type="text"
                  pattern="^(?:[01]\d|2[0-3]):[0-5]\d$"
                  value={prog.time_horizon.start_time}
                  onChange={(e) => handleHorizonChange('start_time', e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-mono text-xs"
                  placeholder="21:00"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Forecast Window End
                </label>
                <input
                  type="text"
                  pattern="^(?:[01]\d|2[0-3]):[0-5]\d$"
                  value={prog.time_horizon.end_time}
                  onChange={(e) => handleHorizonChange('end_time', e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-mono text-xs"
                  placeholder="23:30"
                />
              </div>
            </div>

          </div>
        </div>

        {/* ---------------- CARD C: WEATHER CONDITIONS ---------------- */}
        <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-5 space-y-4 hover:border-sky-300 transition-all">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <div className="flex items-center gap-2 text-xs font-bold text-sky-800 uppercase tracking-wider font-mono">
              <CloudSun className="w-4 h-4 text-sky-600" />
              <span>C. Weather Conditions & Open-Meteo Telemetry</span>
            </div>
            <button
              type="button"
              onClick={handleRefreshLiveWeather}
              disabled={isFetchingWeather}
              className="inline-flex items-center gap-1 text-[11px] text-sky-700 hover:text-sky-900 font-bold disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${isFetchingWeather ? 'animate-spin' : ''}`} />
              <span>Refresh Weather</span>
            </button>
          </div>

          <div className="space-y-3 text-xs">
            {/* Condition Mode Selector Buttons */}
            <div>
              <label className="font-semibold text-slate-700 block mb-1.5">
                Select Weather Condition:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                <button
                  type="button"
                  onClick={handleApplyLiveWeather}
                  className={`px-2.5 py-2 rounded-lg text-xs font-bold border transition-all text-center flex flex-col items-center gap-0.5 ${
                    weather.source === 'live_open_meteo'
                      ? 'bg-sky-600 text-white border-sky-600 shadow-sm'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  <span className="text-[10px] uppercase font-mono tracking-wider">Live</span>
                  <span className="truncate">Open-Meteo</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleWeatherChange('manual_scenario', 'clear')}
                  className={`px-2.5 py-2 rounded-lg text-xs font-bold border transition-all text-center flex flex-col items-center gap-0.5 ${
                    weather.source === 'manual_scenario' && weather.condition === 'clear'
                      ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  <span className="text-[10px] uppercase font-mono tracking-wider">1.0x</span>
                  <span>Clear</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleWeatherChange('manual_scenario', 'cloudy')}
                  className={`px-2.5 py-2 rounded-lg text-xs font-bold border transition-all text-center flex flex-col items-center gap-0.5 ${
                    weather.source === 'manual_scenario' && weather.condition === 'cloudy'
                      ? 'bg-slate-700 text-white border-slate-700 shadow-sm'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  <span className="text-[10px] uppercase font-mono tracking-wider">1.05x</span>
                  <span>Cloudy</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleWeatherChange('manual_scenario', 'rainy')}
                  className={`px-2.5 py-2 rounded-lg text-xs font-bold border transition-all text-center flex flex-col items-center gap-0.5 ${
                    weather.source === 'manual_scenario' && weather.condition === 'rainy'
                      ? 'bg-blue-700 text-white border-blue-700 shadow-sm'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  <span className="text-[10px] uppercase font-mono tracking-wider">1.2x</span>
                  <span>Rainy</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleWeatherChange('manual_scenario', 'heavy_rain')}
                  className={`px-2.5 py-2 rounded-lg text-xs font-bold border transition-all text-center flex flex-col items-center gap-0.5 ${
                    weather.source === 'manual_scenario' && weather.condition === 'heavy_rain'
                      ? 'bg-purple-700 text-white border-purple-700 shadow-sm'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  <span className="text-[10px] uppercase font-mono tracking-wider">1.4x</span>
                  <span>Heavy Rain</span>
                </button>
              </div>
            </div>

            {/* Weather Telemetry Details Card */}
            <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2.5">
              <div className="flex justify-between items-center">
                <span className="font-bold text-slate-800 text-xs">
                  Meteorological Telemetry Status
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                  weather.source === 'live_open_meteo'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-slate-100 text-slate-700 border border-slate-300'
                }`}>
                  {weather.source === 'live_open_meteo' ? (liveWeather?.status || 'LIVE OBSERVATION') : 'MANUAL HYPOTHETICAL'}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center font-mono">
                <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-[10px] text-slate-500 block uppercase">Condition</span>
                  <span className="font-bold text-xs text-sky-800 capitalize">
                    {weather.condition.replace('_', ' ')}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-[10px] text-slate-500 block uppercase">Temperature</span>
                  <span className="font-bold text-xs text-slate-900">
                    {liveWeather?.temperature_c != null ? `${liveWeather.temperature_c}°C` : '25.0°C'}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-[10px] text-slate-500 block uppercase">Rainfall</span>
                  <span className="font-bold text-xs text-slate-900">
                    {liveWeather?.precipitation_mm != null ? `${liveWeather.precipitation_mm} mm` : '0.0 mm'}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-[10px] text-slate-500 block uppercase">Surge Factor</span>
                  <span className="font-bold text-xs text-purple-700">
                    {weather.condition === 'heavy_rain' ? '1.40x' : weather.condition === 'rainy' ? '1.20x' : weather.condition === 'light_rain' ? '1.15x' : weather.condition === 'cloudy' ? '1.05x' : '1.00x'}
                  </span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row justify-between text-[11px] text-slate-500 border-t border-slate-100 pt-2 gap-1">
                <span>
                  Provider: <strong className="text-slate-700">Open-Meteo Weather API (Tiruvannamalai)</strong>
                </span>
                <span>
                  Updated: <strong className="text-slate-700">{liveWeather?.last_updated || lastUpdateTimestamp || 'IST'}</strong>
                </span>
              </div>

              {weatherError && (
                <div className="p-2 rounded bg-amber-50 text-amber-800 text-[11px]">
                  {weatherError}. Operating smoothly with manual presets.
                </div>
              )}
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed">
              * Rain factors compress crowd departure windows, resulting in sharper surges around event finish. Travel time multipliers adjust road congestion delay.
            </p>
          </div>
        </div>

        {/* ---------------- CARD D: BUS FLEET & REQUIRED BUS COUNT ---------------- */}
        <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-5 space-y-4 hover:border-sky-300 transition-all">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <div className="flex items-center gap-2 text-xs font-bold text-sky-800 uppercase tracking-wider font-mono">
              <BusIcon className="w-4 h-4 text-sky-600" />
              <span>D. Bus Fleet & Required Bus Planning</span>
            </div>
            <span className="text-[11px] font-bold font-mono px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
              {totalFleet} Fixed Fleet
            </span>
          </div>

          <div className="space-y-3 text-xs">
            {/* 4 FLEET SUMMARY STATS */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center font-mono">
              <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                <span className="text-[10px] text-slate-500 block uppercase">Total Fleet</span>
                <span className="font-bold text-base text-slate-900">{totalFleet}</span>
                <span className="text-[9px] text-slate-400 block font-sans">Conserved</span>
              </div>

              <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                <span className="text-[10px] text-slate-500 block uppercase">Available</span>
                <span className="font-bold text-base text-emerald-700">{availableBuses}</span>
                <span className="text-[9px] text-slate-400 block font-sans">Active</span>
              </div>

              <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                <span className="text-[10px] text-slate-500 block uppercase">Req. at Peak</span>
                <span className="font-bold text-base text-sky-700">{estimatedBusesRequired}</span>
                <span className="text-[9px] text-slate-400 block font-sans">Estimated</span>
              </div>

              <div className={`p-2.5 rounded-lg bg-white border ${
                busSurplusOrShortage < 0 ? 'border-amber-400 bg-amber-50/50' : 'border-slate-200'
              }`}>
                <span className="text-[10px] text-slate-500 block uppercase">Shortage / Surplus</span>
                <span className={`font-bold text-base ${
                  busSurplusOrShortage < 0 ? 'text-amber-700' : 'text-emerald-700'
                }`}>
                  {busSurplusOrShortage < 0 ? `${busSurplusOrShortage} Buses` : `+${busSurplusOrShortage} Buses`}
                </span>
                <span className="text-[9px] text-slate-400 block font-sans">
                  {busSurplusOrShortage < 0 ? 'Deficit at Peak' : 'Surplus Capacity'}
                </span>
              </div>
            </div>

            {/* Current Fleet Deployment by Stop */}
            <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
              <span className="font-bold text-slate-800 text-xs block">
                Current Fleet Allocation by Stop Stand
              </span>
              <div className="space-y-1 font-mono text-[11px]">
                {formData.stops.map((stop) => {
                  const assigned = formData.fleet.filter(
                    (b) => b.initial_stop_id === stop.stop_id && b.status === 'available'
                  ).length;
                  return (
                    <div key={stop.stop_id} className="flex justify-between items-center py-1 border-b border-slate-100 last:border-0">
                      <div>
                        <strong className="text-slate-900">{stop.name}</strong>
                        <span className="text-slate-400 ml-1">({stop.stop_id})</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500">Min reserve: {stop.min_service_buses}</span>
                        <span className="px-2 py-0.5 rounded bg-slate-100 font-bold text-slate-800">
                          {assigned} buses assigned
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Fixed Fleet Constraint Notice */}
            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
              <span>Bus seat capacity: <strong>60–65 seats</strong> (~30 pax/15-min interval)</span>
              <button
                type="button"
                onClick={() => setShowAdvancedFleetTable(!showAdvancedFleetTable)}
                className="text-sky-700 hover:text-sky-900 font-bold flex items-center gap-1"
              >
                <span>{showAdvancedFleetTable ? 'Hide Fleet Roster' : 'Configure 16 Buses'}</span>
                {showAdvancedFleetTable ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>

            {/* Collapsible Fleet Inventory Table */}
            {showAdvancedFleetTable && (
              <div className="border border-slate-200 rounded-lg overflow-x-auto max-h-48 custom-scrollbar">
                <table className="w-full text-left text-xs bg-white">
                  <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="p-2">Bus ID</th>
                      <th className="p-2">Initial Stop</th>
                      <th className="p-2">Capacity</th>
                      <th className="p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {formData.fleet.map((bus) => (
                      <tr key={bus.bus_id} className="hover:bg-slate-50">
                        <td className="p-2 font-bold text-sky-800">{bus.bus_id}</td>
                        <td className="p-2 text-slate-700">{bus.initial_stop_id}</td>
                        <td className="p-2 text-slate-700">{bus.capacity} seats</td>
                        <td className="p-2">
                          <select
                            value={bus.status}
                            onChange={(e) => handleBusStatusToggle(bus.bus_id, e.target.value as any)}
                            className="px-1.5 py-0.5 rounded border border-slate-300 text-xs bg-white font-sans"
                          >
                            <option value="available">available</option>
                            <option value="maintenance">maintenance</option>
                            <option value="offline">offline</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* 3. PROMINENT RUN PREDICTION MAIN ACTION BAR (PHASE 3 & 4) */}
      <div className="pt-2 flex flex-col sm:flex-row justify-between items-center gap-4 bg-gradient-to-r from-slate-50 via-sky-50/50 to-slate-50 p-4 rounded-xl border border-sky-100">
        <div className="space-y-0.5 text-center sm:text-left">
          <div className="flex items-center gap-2 justify-center sm:justify-start">
            <TrendingUp className="w-4 h-4 text-sky-700" />
            <span className="font-bold text-xs uppercase tracking-wider text-slate-800">
              Deterministic 3-Stage Pipeline
            </span>
            <span className="text-xs text-slate-500">•</span>
            <span className="text-xs text-slate-600 font-medium">
              Crowd Forecast → Fixed-Fleet Allocation → Queue Simulation
            </span>
          </div>
          <p className="text-[11px] text-slate-500">
            {hasRunInitialPrediction
              ? 'Automatic recalculation is active: modifying attendance, weather, or times recalculates instantly.'
              : 'Click Run Prediction below to calculate crowd surges and bus relocations.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => handleManualRun()}
            disabled={isLoading || isUpdating || !isSharesSumValid}
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-sky-700 hover:from-blue-700 hover:to-sky-800 text-white font-bold text-sm shadow-md shadow-blue-600/30 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
          >
            {isUpdating || isLoading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Running Prediction...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-white text-white" />
                <span>Run Prediction</span>
              </>
            )}
          </button>
        </div>
      </div>

    </div>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import {
  Save,
  RotateCcw,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  Calendar,
  Clock,
  Users,
  Bus as BusIcon,
  CloudSun,
  MapPin,
  Sparkles,
  Info,
  Radio,
} from 'lucide-react';
import { Bus, LiveWeatherResponse, ScenarioData, Stop, WeatherCondition } from '../types/api';
import { api } from '../services/api';
import { formatTo12Hour, isValid24HourTime } from '../utils/timeFormat';

interface ScenarioFormProps {
  scenario: ScenarioData | null;
  onApplyScenario: (updated: ScenarioData) => void;
  onReloadSaved: () => void;
  isLoading?: boolean;
}

export const ScenarioForm: React.FC<ScenarioFormProps> = ({
  scenario,
  onApplyScenario,
  onReloadSaved,
  isLoading = false,
}) => {
  // 1. ALL HOOKS DECLARED UNCONDITIONALLY AT THE TOP LEVEL (STRICT REACT COMPLIANCE)
  const [formData, setFormData] = useState<ScenarioData | null>(null);
  const [autoSyncStatus, setAutoSyncStatus] = useState<'IDLE' | 'SYNCING' | 'SYNCED'>('SYNCED');
  const [liveWeather, setLiveWeather] = useState<LiveWeatherResponse | null>(null);
  const [isFetchingWeather, setIsFetchingWeather] = useState<boolean>(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const debounceTimerRef = useRef<any>(null);

  // Sync internal form data with scenario prop
  useEffect(() => {
    if (scenario) {
      setFormData(JSON.parse(JSON.stringify(scenario)));
      setAutoSyncStatus('SYNCED');
    }
  }, [scenario]);

  // Initial live weather fetch
  useEffect(() => {
    let isMounted = true;
    const fetchWeather = async () => {
      try {
        setIsFetchingWeather(true);
        setWeatherError(null);
        const data = await api.getLiveWeather(false);
        if (isMounted) {
          setLiveWeather(data);
        }
      } catch (err: any) {
        if (isMounted) {
          setWeatherError(err.message || 'Live weather service unreachable');
        }
      } finally {
        if (isMounted) {
          setIsFetchingWeather(false);
        }
      }
    };
    fetchWeather();
    return () => {
      isMounted = false;
    };
  }, []);

  // Automatic Scenario Pipeline Updates with debouncing
  useEffect(() => {
    if (!formData || !scenario) return;
    if (JSON.stringify(formData) === JSON.stringify(scenario)) return;

    // Validate essential fields before triggering auto-recalculation
    const prog = formData.festival_programme;
    if (prog.expected_total_attendance <= 0) return;
    if (!isValid24HourTime(prog.scheduled_event_end_time)) return;
    if (!isValid24HourTime(prog.time_horizon.start_time)) return;
    if (!isValid24HourTime(prog.time_horizon.end_time)) return;

    const sharesTotal = Object.values(prog.demand_distribution).reduce((sum, v) => sum + v, 0) * 100;
    if (Math.abs(sharesTotal - 100) > 1.5) return;

    setAutoSyncStatus('SYNCING');
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      onApplyScenario(formData);
      setAutoSyncStatus('SYNCED');
    }, 600);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [formData, scenario, onApplyScenario]);

  // 2. SAFE CONDITIONAL RENDER AFTER ALL HOOKS HAVE EXECUTED
  if (!formData) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500 space-y-2">
        <RefreshCw className="w-6 h-6 animate-spin text-sky-600 mx-auto" />
        <p className="font-semibold text-slate-700">Loading Festival Scenario Configuration...</p>
      </div>
    );
  }

  const prog = formData.festival_programme;
  const weather = formData.weather;

  // Handle program edits
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

  // Handle time horizon edits
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

  // Handle weather source and condition change
  const handleWeatherChange = (source: 'manual_scenario' | 'live_open_meteo', condition: WeatherCondition) => {
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
          rainfall_mm: liveWeather?.rain_mm ?? liveWeather?.precipitation_mm,
          last_updated: liveWeather?.last_updated,
        },
      };
    });
  };

  // Refresh live weather from Open-Meteo
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

  // Apply Live Weather observation to scenario
  const handleApplyLiveWeather = () => {
    if (!liveWeather) return;
    handleWeatherChange('live_open_meteo', liveWeather.condition);
  };

  // Handle demand share updates
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

  // Handle min buses updates
  const handleMinBusesChange = (stopId: string, minBuses: number) => {
    setFormData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        stops: prev.stops.map((s) => (s.stop_id === stopId ? { ...s, min_service_buses: Math.max(0, minBuses) } : s)),
      };
    });
  };

  // Handle coordinates updates
  const handleStopCoordChange = (stopId: string, field: 'latitude' | 'longitude', value: string) => {
    const num = value.trim() ? parseFloat(value) : undefined;
    setFormData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        stops: prev.stops.map((s) => (s.stop_id === stopId ? { ...s, [field]: num } : s)),
      };
    });
  };

  // Handle bus edits
  const handleBusChange = (busId: string, field: keyof Bus, value: any) => {
    setFormData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        fleet: prev.fleet.map((b) => (b.bus_id === busId ? { ...b, [field]: value } : b)),
      };
    });
  };

  // Quick Action: Load standard reproducible Demo Scenario (Karthigai Deepam)
  const handleLoadDemoScenario = () => {
    if (!scenario) return;
    const demo: ScenarioData = {
      ...scenario,
      festival_programme: {
        event_name: 'Karthigai Deepam Maha Utsavam 2026',
        scheduled_event_end_time: '21:30',
        event_start_time: '18:00',
        event_date: '2026-11-26',
        event_end_date: '2026-11-26',
        event_delay_minutes: 0,
        timezone: 'Asia/Kolkata',
        forecast_horizon_hours: 24,
        time_horizon: {
          start_time: '20:30',
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
        notes: 'Reproducible demonstration festival schedule',
      },
    };
    setFormData(demo);
    onApplyScenario(demo);
    setAutoSyncStatus('SYNCED');
  };

  const sharesSum = Object.values(prog.demand_distribution).reduce((sum, v) => sum + v, 0) * 100;
  const isSharesSumValid = Math.abs(sharesSum - 100) < 1.0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prog.expected_total_attendance <= 0) {
      setValidationError('Expected attendance must be greater than zero.');
      return;
    }
    if (!isSharesSumValid) {
      setValidationError(`Stop demand shares must sum to 100% (currently ${sharesSum.toFixed(1)}%).`);
      return;
    }
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    onApplyScenario(formData);
    setAutoSyncStatus('SYNCED');
  };

  const isLiveWeatherActive = formData.weather.source === 'live_open_meteo';

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-6">
      
      {/* 1. HEADER WITH SYNC STATUS & PRESET BUTTONS */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-heading font-bold text-xl text-slate-900">
              Festival Scenario & Fleet Configuration
            </h3>
            {autoSyncStatus === 'SYNCING' || isLoading ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-800 border border-sky-200 text-[11px] font-semibold animate-pulse">
                <RefreshCw className="w-3 h-3 animate-spin text-sky-600" />
                <span>Synchronizing Pipeline...</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-semibold">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                <span>Up to Date</span>
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure expected attendance, event duration, transit shares, real-time weather, and bus depot assignments.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleLoadDemoScenario}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-300 text-xs font-semibold shadow-sm transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-sky-600" />
            <span>Load Demo Scenario</span>
          </button>
          <button
            type="button"
            onClick={onReloadSaved}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-semibold shadow-sm transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
            <span>Reset to Defaults</span>
          </button>
        </div>
      </div>

      {validationError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-center gap-2 font-medium">
          <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
          <span>{validationError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* 2. SECTION A: FESTIVAL EVENT TIMING & VENUE METRICS */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-sky-800 uppercase tracking-wider border-b border-slate-100 pb-1.5">
            <Calendar className="w-3.5 h-3.5 text-sky-600" />
            <span>Festival Event Details & Attendance</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2 space-y-1">
              <label className="text-xs font-semibold text-slate-700">
                Festival / Event Name
              </label>
              <input
                type="text"
                value={prog.event_name}
                onChange={(e) => handleProgChange('event_name', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                placeholder="e.g. Karthigai Deepam Maha Utsavam 2026"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">
                Total Expected Attendance
              </label>
              <input
                type="number"
                min="1000"
                step="500"
                value={prog.expected_total_attendance}
                onChange={(e) => handleProgChange('expected_total_attendance', Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-sky-500"
                required
              />
              <span className="text-[11px] text-slate-400">Total worshippers/attendees</span>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">
                Public Transit Fraction
              </label>
              <input
                type="number"
                min="0.05"
                max="1.0"
                step="0.05"
                value={prog.exiting_passenger_fraction}
                onChange={(e) => handleProgChange('exiting_passenger_fraction', Math.min(1.0, Math.max(0.05, parseFloat(e.target.value) || 0.85)))}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-sky-500"
                required
              />
              <span className="text-[11px] text-slate-500 font-mono">
                {(prog.exiting_passenger_fraction * 100).toFixed(0)}% (~{Math.round(prog.expected_total_attendance * prog.exiting_passenger_fraction).toLocaleString()} bus passengers)
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 pt-1">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">
                Event Date
              </label>
              <input
                type="date"
                value={prog.event_date || '2026-11-26'}
                onChange={(e) => handleProgChange('event_date', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold text-slate-700">
                  Event Start Time
                </label>
                <span className="text-[11px] font-mono text-sky-700 font-bold">
                  {formatTo12Hour(prog.event_start_time || '18:00')}
                </span>
              </div>
              <input
                type="text"
                pattern="^(?:[01]\d|2[0-3]):[0-5]\d$"
                value={prog.event_start_time || '18:00'}
                onChange={(e) => handleProgChange('event_start_time', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-sky-500"
                placeholder="18:00"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold text-slate-700">
                  Scheduled End Time
                </label>
                <span className="text-[11px] font-mono text-sky-700 font-bold">
                  {formatTo12Hour(prog.scheduled_event_end_time)}
                </span>
              </div>
              <input
                type="text"
                pattern="^(?:[01]\d|2[0-3]):[0-5]\d$"
                value={prog.scheduled_event_end_time}
                onChange={(e) => handleProgChange('scheduled_event_end_time', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-sky-500"
                placeholder="21:30"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">
                Venue Timezone
              </label>
              <input
                type="text"
                value={prog.timezone || 'Asia/Kolkata (IST)'}
                readOnly
                className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-100 text-sm font-mono text-slate-600"
              />
            </div>
          </div>
        </div>

        {/* 3. SECTION B: REAL-TIME METEOROLOGICAL TELEMETRY & WEATHER SCENARIOS */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
            <div className="flex items-center gap-2 text-xs font-bold text-sky-800 uppercase tracking-wider">
              <CloudSun className="w-3.5 h-3.5 text-sky-600" />
              <span>Weather Observations & Scenario Modeling</span>
            </div>
            <button
              type="button"
              onClick={handleRefreshLiveWeather}
              disabled={isFetchingWeather}
              className="inline-flex items-center gap-1 text-[11px] text-sky-700 hover:text-sky-900 font-bold disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${isFetchingWeather ? 'animate-spin' : ''}`} />
              <span>Refresh Open-Meteo</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* CARD 1: LIVE GROUND TELEMETRY (OPEN-METEO) */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                      Live Regional Telemetry
                    </span>
                    <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold uppercase tracking-wider ${
                      liveWeather?.status === 'LIVE'
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : liveWeather?.status === 'CACHED'
                        ? 'bg-sky-100 text-sky-800 border border-sky-300'
                        : 'bg-amber-100 text-amber-800 border border-amber-300'
                    }`}>
                      {liveWeather?.status || 'QUERYING'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Tiruvannamalai (12.2253° N, 79.0747° E) • Open-Meteo ground model
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleApplyLiveWeather}
                  className="px-2.5 py-1 rounded bg-sky-700 hover:bg-sky-800 text-white text-[11px] font-bold shadow-sm"
                >
                  Apply Live
                </button>
              </div>

              {liveWeather ? (
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <span className="block text-[10px] text-slate-500 uppercase">Temp</span>
                    <span className="font-mono font-bold text-sm text-slate-900">
                      {liveWeather.temperature_c ?? '--'}°C
                    </span>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <span className="block text-[10px] text-slate-500 uppercase">Rainfall</span>
                    <span className="font-mono font-bold text-sm text-slate-900">
                      {liveWeather.precipitation_mm ?? 0} mm
                    </span>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <span className="block text-[10px] text-slate-500 uppercase">Condition</span>
                    <span className="font-semibold text-xs text-sky-700 truncate block" title={liveWeather.condition_description}>
                      {liveWeather.condition_description}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-500 py-2">
                  {weatherError || 'Fetching live Open-Meteo telemetry...'}
                </div>
              )}
            </div>

            {/* CARD 2: ACTIVE SCENARIO SELECTION */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                  Active Scenario Weather Mode
                </span>
                <span className="text-[11px] text-slate-500 font-mono">
                  Multiplier: {weather.condition === 'heavy_rain' ? '1.4x (Surge)' : weather.condition === 'rainy' ? '1.25x' : weather.condition === 'light_rain' ? '1.15x' : '1.0x'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className={`p-2.5 rounded-lg border cursor-pointer text-xs flex items-center gap-2 transition-all ${
                  isLiveWeatherActive
                    ? 'border-sky-500 bg-sky-50 text-sky-950 font-bold shadow-sm'
                    : 'border-slate-200 bg-white text-slate-700'
                }`}>
                  <input
                    type="radio"
                    name="weather_source"
                    checked={isLiveWeatherActive}
                    onChange={() => handleApplyLiveWeather()}
                    className="text-sky-600 focus:ring-sky-500"
                  />
                  <span>Live Ground Weather</span>
                </label>

                <label className={`p-2.5 rounded-lg border cursor-pointer text-xs flex items-center gap-2 transition-all ${
                  !isLiveWeatherActive
                    ? 'border-sky-500 bg-sky-50 text-sky-950 font-bold shadow-sm'
                    : 'border-slate-200 bg-white text-slate-700'
                }`}>
                  <input
                    type="radio"
                    name="weather_source"
                    checked={!isLiveWeatherActive}
                    onChange={() => handleWeatherChange('manual_scenario', weather.condition)}
                    className="text-sky-600 focus:ring-sky-500"
                  />
                  <span>Manual Scenario Preset</span>
                </label>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-600">
                  Select Atmospheric Condition:
                </label>
                <select
                  value={weather.condition}
                  onChange={(e) => handleWeatherChange('manual_scenario', e.target.value as WeatherCondition)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white font-medium focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="clear">Clear Skies (Multiplier 1.0x - Standard egress)</option>
                  <option value="cloudy">Cloudy / Overcast (Multiplier 1.05x)</option>
                  <option value="light_rain">Light Passing Rain (Multiplier 1.15x)</option>
                  <option value="rainy">Moderate Continuous Rain (Multiplier 1.25x)</option>
                  <option value="heavy_rain">Heavy Monsoon Storm (Multiplier 1.40x - Urgent peak surge)</option>
                </select>
              </div>
            </div>

          </div>
        </div>

        {/* 4. SECTION C: TIME HORIZON & RESOLUTION */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center gap-2 text-xs font-bold text-sky-800 uppercase tracking-wider border-b border-slate-100 pb-1.5">
            <Clock className="w-3.5 h-3.5 text-sky-600" />
            <span>Forecast Window & Simulation Resolution</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold text-slate-700">
                  Analysis Start (HH:MM)
                </label>
                <span className="text-[11px] font-mono text-sky-700 font-bold">
                  {formatTo12Hour(prog.time_horizon.start_time)}
                </span>
              </div>
              <input
                type="text"
                pattern="^(?:[01]\d|2[0-3]):[0-5]\d$"
                value={prog.time_horizon.start_time}
                onChange={(e) => handleHorizonChange('start_time', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-sky-500"
                required
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold text-slate-700">
                  Analysis End (HH:MM)
                </label>
                <span className="text-[11px] font-mono text-sky-700 font-bold">
                  {formatTo12Hour(prog.time_horizon.end_time)}
                </span>
              </div>
              <input
                type="text"
                pattern="^(?:[01]\d|2[0-3]):[0-5]\d$"
                value={prog.time_horizon.end_time}
                onChange={(e) => handleHorizonChange('end_time', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-sky-500"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">
                Discrete Interval Resolution
              </label>
              <select
                value={prog.time_horizon.interval_minutes}
                onChange={(e) => handleHorizonChange('interval_minutes', parseInt(e.target.value) || 15)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white"
              >
                <option value={15}>15 Minutes (Standard Operations)</option>
                <option value={30}>30 Minutes (Macro Horizon)</option>
                <option value={60}>60 Minutes (Hourly Aggregated)</option>
              </select>
            </div>
          </div>
        </div>

        {/* 5. SECTION D: STOPS & DEMAND SPLIT */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
              <h4 className="font-semibold text-sm text-slate-900">
                Designated Bus Stands & Crowd Demand Shares
              </h4>
              <p className="text-xs text-slate-500">
                Define the distribution of departing devotees across terminals and assign minimum safety reserves.
              </p>
            </div>
            <div className={`px-2.5 py-1 rounded text-xs font-bold font-mono border ${
              isSharesSumValid
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                : 'bg-amber-50 text-amber-800 border-amber-300'
            }`}>
              Shares Total: {sharesSum.toFixed(1)}% {isSharesSumValid ? '✓' : '(Must equal 100%)'}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs bg-white rounded-lg border border-slate-200">
              <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-2.5">Stop Code</th>
                  <th className="p-2.5">Stand Name</th>
                  <th className="p-2.5">Min Reserve Buses</th>
                  <th className="p-2.5">Demand Share (%)</th>
                  <th className="p-2.5">Est. Passengers</th>
                  <th className="p-2.5">Latitude</th>
                  <th className="p-2.5">Longitude</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {formData.stops.map((stop) => {
                  const shareVal = (prog.demand_distribution[stop.stop_id] || 0) * 100;
                  const totalTransitPax = Math.round(prog.expected_total_attendance * prog.exiting_passenger_fraction);
                  const stopEstPax = Math.round(totalTransitPax * (prog.demand_distribution[stop.stop_id] || 0));
                  return (
                    <tr key={stop.stop_id} className="hover:bg-slate-50">
                      <td className="p-2.5 font-bold text-slate-900">{stop.stop_id}</td>
                      <td className="p-2.5 font-sans font-medium">{stop.name}</td>
                      <td className="p-2.5">
                        <input
                          type="number"
                          min="0"
                          max="20"
                          value={stop.min_service_buses}
                          onChange={(e) => handleMinBusesChange(stop.stop_id, parseInt(e.target.value) || 0)}
                          className="w-20 px-2 py-1 rounded border border-slate-300 text-xs font-mono"
                        />
                      </td>
                      <td className="p-2.5">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.5"
                            value={shareVal.toFixed(1)}
                            onChange={(e) => handleShareChange(stop.stop_id, parseFloat(e.target.value) || 0)}
                            className="w-20 px-2 py-1 rounded border border-slate-300 text-xs font-mono"
                          />
                          <span className="font-sans text-slate-500">%</span>
                        </div>
                      </td>
                      <td className="p-2.5 text-slate-700 font-semibold font-mono">
                        ~{stopEstPax.toLocaleString()}
                      </td>
                      <td className="p-2.5">
                        <input
                          type="number"
                          step="0.0001"
                          placeholder="12.2285"
                          value={stop.latitude !== undefined && stop.latitude !== null ? stop.latitude : ''}
                          onChange={(e) => handleStopCoordChange(stop.stop_id, 'latitude', e.target.value)}
                          className="w-24 px-2 py-1 rounded border border-slate-300 text-xs font-mono"
                        />
                      </td>
                      <td className="p-2.5">
                        <input
                          type="number"
                          step="0.0001"
                          placeholder="79.0700"
                          value={stop.longitude !== undefined && stop.longitude !== null ? stop.longitude : ''}
                          onChange={(e) => handleStopCoordChange(stop.stop_id, 'longitude', e.target.value)}
                          className="w-24 px-2 py-1 rounded border border-slate-300 text-xs font-mono"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 6. SECTION E: FLEET INVENTORY ROSTER */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="flex justify-between items-center">
            <div>
              <h4 className="font-semibold text-sm text-slate-900">
                Fixed Fleet Inventory ({formData.fleet.length} Configured Vehicles)
              </h4>
              <p className="text-xs text-slate-500">
                Boarding throughput standardized to <code className="font-mono bg-slate-200 px-1 py-0.5 rounded">floor(capacity / 2)</code> per 15-minute interval.
              </p>
            </div>
            <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[11px] font-bold font-mono">
              Fixed Fleet Conserved: {formData.fleet.length}
            </span>
          </div>

          <div className="overflow-x-auto max-h-56 custom-scrollbar">
            <table className="w-full text-left text-xs bg-white rounded-lg border border-slate-200">
              <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-200 sticky top-0">
                <tr>
                  <th className="p-2.5">Bus ID</th>
                  <th className="p-2.5">Assigned Depot</th>
                  <th className="p-2.5">Total Capacity</th>
                  <th className="p-2.5">15-Min Boarding Cap</th>
                  <th className="p-2.5">Operational Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {formData.fleet.map((bus) => {
                  const intCap = Math.floor(bus.capacity / 2);
                  return (
                    <tr key={bus.bus_id} className="hover:bg-slate-50">
                      <td className="p-2.5 font-bold text-sky-700">{bus.bus_id}</td>
                      <td className="p-2.5">
                        <select
                          value={bus.initial_stop_id}
                          onChange={(e) => handleBusChange(bus.bus_id, 'initial_stop_id', e.target.value)}
                          className="px-2 py-1 rounded border border-slate-300 text-xs bg-white"
                        >
                          {formData.stops.map((s) => (
                            <option key={s.stop_id} value={s.stop_id}>
                              {s.stop_id}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2.5">
                        <input
                          type="number"
                          min="20"
                          max="120"
                          step="5"
                          value={bus.capacity}
                          onChange={(e) => handleBusChange(bus.bus_id, 'capacity', parseInt(e.target.value) || 60)}
                          className="w-16 px-2 py-1 rounded border border-slate-300 text-xs font-mono"
                        />
                      </td>
                      <td className="p-2.5 font-bold text-emerald-700">{intCap} pax</td>
                      <td className="p-2.5">
                        <select
                          value={bus.status}
                          onChange={(e) => handleBusChange(bus.bus_id, 'status', e.target.value as any)}
                          className="px-2 py-1 rounded border border-slate-300 text-xs bg-white font-sans"
                        >
                          <option value="available">available</option>
                          <option value="maintenance">maintenance</option>
                          <option value="offline">offline</option>
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 7. SCENARIO CONFIGURATION SUMMARY CARD */}
        <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 text-xs text-sky-950 space-y-2">
          <div className="flex items-center gap-1.5 font-bold text-sky-900 uppercase tracking-wide">
            <Info className="w-4 h-4 text-sky-600" />
            <span>Active Scenario Summary Before Recalculation</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]">
            <div>
              <span className="text-slate-500 block">Event:</span>
              <span className="font-bold">{prog.event_name}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Attendance:</span>
              <span className="font-bold">{prog.expected_total_attendance.toLocaleString()} ({Math.round(prog.expected_total_attendance * prog.exiting_passenger_fraction).toLocaleString()} via transit)</span>
            </div>
            <div>
              <span className="text-slate-500 block">Peak Window:</span>
              <span className="font-bold">{formatTo12Hour(prog.scheduled_event_end_time)}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Fleet:</span>
              <span className="font-bold">{formData.fleet.length} Fixed Buses</span>
            </div>
          </div>
        </div>

        {/* SUBMIT BUTTON */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={isLoading || !isSharesSumValid}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-sm shadow-md shadow-blue-600/20 transition-all hover:translate-y-[-0.5px]"
          >
            <Save className="w-4 h-4" />
            <span>Apply Parameters & Recalculate Pipeline</span>
          </button>
        </div>

      </form>
    </div>
  );
};

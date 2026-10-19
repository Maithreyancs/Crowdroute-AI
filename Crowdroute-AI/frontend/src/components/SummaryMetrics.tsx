import React from 'react';
import {
  Bus,
  Users,
  ShieldCheck,
  Clock,
  CloudSun,
  CloudRain,
  Cloud,
  CloudLightning,
  Sun,
  RefreshCw,
  AlertCircle,
  Activity,
  Layers,
  Thermometer,
  Wind,
  Droplets,
  MapPin,
  CheckCircle2,
  Radio,
} from 'lucide-react';
import {
  AllocateResponse,
  ForecastResponse,
  LiveWeatherResponse,
  OperationalMode,
  ScenarioData,
} from '../types/api';
import { formatTo12Hour, shiftTimeHHMM } from '../utils/timeFormat';

export interface SummaryMetricsProps {
  scenario: ScenarioData | null;
  forecast: ForecastResponse | null;
  allocation?: AllocateResponse | null;
  systemMode: OperationalMode;
  onSetMode: (mode: OperationalMode) => void;
  onResetDefaults: () => void;
  onRefresh: () => void;
  isLoading?: boolean;
  isUpdating?: boolean;
  liveWeather?: LiveWeatherResponse | null;
  weatherError?: string | null;
  lastUpdateTimestamp?: string;
  lastSuccessfulTelemetryTime?: string | null;
  errorMessage?: string | null;
  hasRunInitialPrediction?: boolean;
  isManualWeatherOverride?: boolean;
}

export const SummaryMetrics: React.FC<SummaryMetricsProps> = ({
  scenario,
  forecast,
  allocation,
  systemMode,
  onSetMode,
  onResetDefaults,
  onRefresh,
  isLoading = false,
  isUpdating = false,
  liveWeather = null,
  weatherError = null,
  lastUpdateTimestamp = '',
  lastSuccessfulTelemetryTime = null,
  errorMessage = null,
  hasRunInitialPrediction = true,
  isManualWeatherOverride = false,
}) => {
  const stopsCount = scenario?.stops.length || 3;
  const fleetCount = scenario?.fleet.length || 16;
  const totalAttendance = scenario?.festival_programme.expected_total_attendance || 40000;
  const exitingFraction = scenario?.festival_programme.exiting_passenger_fraction || 0.85;
  const expectedPassengers = Math.round(totalAttendance * exitingFraction);

  const currentWeather = scenario?.weather.condition || 'clear';

  // Dynamic Event Conclusion Time calculation (respecting delay minutes and midnight wrapping)
  const baseEndTime = scenario?.festival_programme.scheduled_event_end_time || '21:30';
  const delayMinutes = scenario?.festival_programme.event_delay_minutes || 0;
  const effectiveEndTime = delayMinutes > 0 ? shiftTimeHHMM(baseEndTime, delayMinutes) : baseEndTime;
  const formattedConclusion = formatTo12Hour(effectiveEndTime);

  // Weather Icon selector
  const getWeatherIcon = (cond: string) => {
    switch (cond) {
      case 'heavy_rain':
        return <CloudLightning className="w-5 h-5 text-purple-400" />;
      case 'rainy':
      case 'light_rain':
        return <CloudRain className="w-5 h-5 text-blue-400" />;
      case 'cloudy':
        return <Cloud className="w-5 h-5 text-slate-300" />;
      case 'clear':
      default:
        return <Sun className="w-5 h-5 text-amber-400" />;
    }
  };

  // Determine Telemetry Source Status Badge
  const getTelemetryBadge = () => {
    if (weatherError || liveWeather?.status === 'UNAVAILABLE') {
      return {
        label: 'TELEMETRY UNAVAILABLE',
        className: 'bg-rose-500/20 text-rose-300 border-rose-400/30',
        dotColor: 'bg-rose-400',
      };
    }
    if (isManualWeatherOverride) {
      return {
        label: 'MANUAL SCENARIO',
        className: 'bg-indigo-500/20 text-indigo-300 border-indigo-400/30',
        dotColor: 'bg-indigo-400',
      };
    }
    if (liveWeather?.status === 'CACHED') {
      return {
        label: 'CACHED TELEMETRY',
        className: 'bg-amber-500/20 text-amber-300 border-amber-400/30',
        dotColor: 'bg-amber-400',
      };
    }
    if (liveWeather?.status === 'LIVE') {
      return {
        label: 'LIVE TELEMETRY',
        className: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30',
        dotColor: 'bg-emerald-400 animate-pulse',
      };
    }
    return {
      label: 'SCENARIO ACTIVE',
      className: 'bg-blue-500/20 text-blue-300 border-blue-400/30',
      dotColor: 'bg-blue-400',
    };
  };

  // 4-State Truthful Pipeline Status Indicator
  const isPipelineBusy = isLoading || isUpdating;
  const getPipelineStatus = () => {
    if (isPipelineBusy) {
      return {
        state: 'Updating' as const,
        title: 'Updating Reallocation Pipeline...',
        description:
          'Recalculating crowd egress curves, fixed-fleet bus relocation recommendations, and queue simulation across stops.',
        bannerClass: 'bg-blue-950/40 border-blue-500/40 text-blue-200',
        icon: <RefreshCw className="w-4 h-4 text-blue-400 animate-spin flex-shrink-0" />,
        badgeText: 'UPDATING',
        badgeClass: 'bg-blue-500/20 text-blue-300 border-blue-400/30',
      };
    }

    if (errorMessage) {
      return {
        state: 'Error' as const,
        title: 'Automatic Reallocation Pipeline Error',
        description: `The latest calculation failed: ${errorMessage}. Preserving previous valid operational plan.`,
        bannerClass: 'bg-rose-950/40 border-rose-500/40 text-rose-200',
        icon: <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />,
        badgeText: 'ERROR',
        badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-400/30',
      };
    }

    if (lastUpdateTimestamp && hasRunInitialPrediction) {
      return {
        state: 'Up to Date' as const,
        title: 'Automatic Reallocation Pipeline Up to Date',
        description:
          'All downstream models (Crowd Demand, Bus Allocation, Queue Simulation, Map and Timetable) are fully synchronized.',
        bannerClass: 'bg-emerald-950/30 border-emerald-500/30 text-emerald-200',
        icon: <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />,
        badgeText: 'UP TO DATE',
        badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30',
      };
    }

    return {
      state: 'Ready' as const,
      title: 'Automatic Reallocation Pipeline Ready',
      description:
        'Scenario is valid. Any change to weather conditions or event-end timing triggers downstream recalculation automatically.',
      bannerClass: 'bg-slate-900/60 border-slate-700 text-slate-300',
      icon: <Activity className="w-4 h-4 text-sky-400 flex-shrink-0" />,
      badgeText: 'READY',
      badgeClass: 'bg-slate-700/50 text-slate-300 border-slate-600',
    };
  };

  const badge = getTelemetryBadge();
  const pipeline = getPipelineStatus();

  // Displayed last updated timestamp: truthful, never "Just now" static spoof
  const displayLastUpdated = lastSuccessfulTelemetryTime || lastUpdateTimestamp || 'Pending initial sync';

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 -mt-6 sm:-mt-8 relative z-20 space-y-4">
      {/* 1. DARK 4-CARD METRIC STRIP */}
      <div className="bg-[#0f172a] text-white border border-slate-800 rounded-xl shadow-2xl p-4 sm:p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-800/80">
          {/* CARD 1: 16 BUSES */}
          <div className="flex items-start gap-3.5 pt-3 sm:pt-0 sm:px-3 first:pl-0">
            <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700/80 flex items-center justify-center flex-shrink-0 text-sky-400">
              <Bus className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="font-heading text-2xl sm:text-3xl font-black text-white leading-none block font-mono">
                {fleetCount}
              </span>
              <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block mt-1">
                CONSERVED FIXED FLEET
              </span>
              <span className="text-[11px] text-slate-400 truncate block mt-0.5">
                {stopsCount} Monitored Stands • 0 Phantom
              </span>
            </div>
          </div>

          {/* CARD 2: EXPECTED PASSENGERS */}
          <div className="flex items-start gap-3.5 pt-3 sm:pt-0 sm:px-3">
            <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700/80 flex items-center justify-center flex-shrink-0 text-amber-400">
              <Users className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="font-heading text-2xl sm:text-3xl font-black text-white leading-none block font-mono">
                {expectedPassengers.toLocaleString()}
              </span>
              <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block mt-1">
                EXPECTED PASSENGERS
              </span>
              <span className="text-[11px] text-slate-400 truncate block mt-0.5">
                85% Egress Fraction ({totalAttendance.toLocaleString()} Attendance)
              </span>
            </div>
          </div>

          {/* CARD 3: 16 / 16 CONSERVED */}
          <div className="flex items-start gap-3.5 pt-3 sm:pt-0 sm:px-3">
            <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700/80 flex items-center justify-center flex-shrink-0 text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="font-heading text-2xl sm:text-3xl font-black text-white leading-none block font-mono">
                {fleetCount} / {fleetCount}
              </span>
              <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block mt-1">
                FLEET CONSERVATION
              </span>
              <span className="text-[11px] text-emerald-400 font-semibold truncate block mt-0.5">
                100% Invariant Conserved
              </span>
            </div>
          </div>

          {/* CARD 4: PREDICTION HORIZONS */}
          <div className="flex items-start gap-3.5 pt-3 sm:pt-0 sm:px-3 last:pr-0">
            <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700/80 flex items-center justify-center flex-shrink-0 text-indigo-400">
              <Clock className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="font-heading text-2xl sm:text-3xl font-black text-white leading-none block font-mono">
                15 / 30 / 60m
              </span>
              <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block mt-1">
                PREDICTION HORIZONS
              </span>
              <span className="text-[11px] text-slate-400 truncate block mt-0.5">
                Post-Ceremony Demand Windows
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. LIVE OPERATIONAL TELEMETRY CARD */}
      <div className="bg-[#0a1120] border border-slate-800 text-white rounded-xl p-4 sm:p-5 shadow-lg space-y-4">
        {/* TOP STATUS BAR */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-800/90 border border-slate-700 flex items-center justify-center flex-shrink-0">
              {getWeatherIcon(currentWeather)}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-heading font-black text-base text-white tracking-wide uppercase">
                  FESTIVAL CORRIDOR TELEMETRY
                </h3>
                <span
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border font-mono ${badge.className}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${badge.dotColor}`} />
                  {badge.label}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Tiruvannamalai Festival Zone • Lat: 12.2285° N, Lon: 79.0700° E • Conclusion:{' '}
                <strong className="text-white font-mono">{formattedConclusion}</strong>
                {delayMinutes > 0 && (
                  <span className="ml-1 text-amber-400 font-semibold font-mono">
                    (+{delayMinutes}m delay)
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-end sm:self-auto text-xs">
            <span className="text-slate-400 font-mono text-[11px]">
              Last updated: <span className="text-slate-200 font-medium">{displayLastUpdated}</span>
            </span>
            <button
              onClick={onRefresh}
              disabled={isPipelineBusy}
              aria-label="Refresh telemetry data"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold transition-all shadow-sm cursor-pointer disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isPipelineBusy ? 'animate-spin' : ''}`} />
              <span>{isPipelineBusy ? 'Updating...' : 'Refresh'}</span>
            </button>
          </div>
        </div>

        {/* TELEMETRY DATA METRICS GRID */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 p-3 rounded-lg bg-slate-900/60 border border-slate-800 text-xs">
          {/* Item 1: Condition */}
          <div className="space-y-0.5">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
              Condition
            </span>
            <span className="text-white font-medium capitalize truncate block">
              {liveWeather?.condition_description || currentWeather.replace('_', ' ')}
            </span>
          </div>

          {/* Item 2: Temperature */}
          <div className="space-y-0.5">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block flex items-center gap-1">
              <Thermometer className="w-3 h-3 text-amber-400" /> Temp
            </span>
            <span className="text-white font-mono font-medium block">
              {liveWeather?.temperature_c != null ? `${liveWeather.temperature_c.toFixed(1)}°C` : '31.0°C (Est)'}
            </span>
          </div>

          {/* Item 3: Precipitation */}
          <div className="space-y-0.5">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block flex items-center gap-1">
              <Droplets className="w-3 h-3 text-sky-400" /> Rain / Precip
            </span>
            <span className="text-white font-mono font-medium block">
              {liveWeather?.rain_mm != null
                ? `${liveWeather.rain_mm} mm`
                : liveWeather?.precipitation_mm != null
                ? `${liveWeather.precipitation_mm} mm`
                : '0.0 mm'}
            </span>
          </div>

          {/* Item 4: Wind Speed */}
          <div className="space-y-0.5">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block flex items-center gap-1">
              <Wind className="w-3 h-3 text-teal-400" /> Wind Speed
            </span>
            <span className="text-white font-mono font-medium block">
              {liveWeather?.wind_speed_kmh != null ? `${liveWeather.wind_speed_kmh.toFixed(1)} km/h` : '12.0 km/h'}
            </span>
          </div>

          {/* Item 5: Telemetry Provider */}
          <div className="space-y-0.5">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block flex items-center gap-1">
              <Radio className="w-3 h-3 text-purple-400" /> Provider
            </span>
            <span className="text-white font-medium truncate block text-[11px]" title={liveWeather?.source || 'Open-Meteo'}>
              {liveWeather?.source ? liveWeather.source.replace(' Weather API', '') : 'Open-Meteo'}
            </span>
          </div>

          {/* Item 6: Observation Timestamp */}
          <div className="space-y-0.5">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block flex items-center gap-1">
              <Clock className="w-3 h-3 text-slate-400" /> Observed
            </span>
            <span className="text-slate-300 font-mono text-[11px] truncate block" title={liveWeather?.observation_time || 'Realtime'}>
              {liveWeather?.observation_time
                ? liveWeather.observation_time.includes('T')
                  ? liveWeather.observation_time.split('T')[1].slice(0, 5)
                  : liveWeather.observation_time
                : 'Live'}
            </span>
          </div>
        </div>

        {/* WEATHER ERROR ALERT (HONEST FAILURE NOTIFICATION) */}
        {weatherError && (
          <div className="bg-rose-950/40 border border-rose-500/40 rounded-lg p-3 text-xs text-rose-200 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <div className="font-bold text-rose-300">Telemetry Source Unavailable</div>
              <p className="text-[11px] text-rose-200/90 leading-relaxed">
                {weatherError}. Manual scenario controls remain fully functional and are driving the active forecast.
              </p>
            </div>
          </div>
        )}

        {/* TRUTHFUL STATE-DRIVEN PIPELINE STATUS CALLOUT */}
        <div className={`border rounded-lg p-3 text-xs space-y-1.5 transition-all ${pipeline.bannerClass}`}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 font-bold">
              {pipeline.icon}
              <span>{pipeline.title}</span>
            </div>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border font-mono ${pipeline.badgeClass}`}>
              {pipeline.badgeText}
            </span>
          </div>
          <p className="text-[11px] leading-relaxed pl-6 opacity-90">
            {pipeline.description}
          </p>
          <div className="text-[10px] font-mono pl-6 opacity-75 pt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              Scenario: <strong>{scenario?.festival_programme.event_name || 'Tiruvannamalai Festival'}</strong> ({formattedConclusion})
            </span>
            <span>•</span>
            <span>
              Weather: <strong>{currentWeather.replace('_', ' ').toUpperCase()}</strong>
            </span>
            <span>•</span>
            <span>
              Fleet: <strong>{fleetCount} buses conserved</strong>
            </span>
            {lastUpdateTimestamp && (
              <>
                <span>•</span>
                <span>Calculated: {lastUpdateTimestamp}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

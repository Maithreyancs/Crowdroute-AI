import React, { useState } from 'react';
import {
  CloudRain,
  Sun,
  Cloud,
  CloudLightning,
  Clock,
  RotateCcw,
  Zap,
  Activity,
  CheckCircle2,
  AlertCircle,
  Radio,
  FileText,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { ScenarioData, WeatherCondition } from '../types/api';
import { formatTo12Hour, parseAnyTimeToHHMM, shiftTimeHHMM } from '../utils/timeFormat';

export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  action: string;
  details: string;
  type: 'weather' | 'delay' | 'reset' | 'system';
}

interface LiveFestivalUpdatesProps {
  scenario: ScenarioData | null;
  onUpdateScenario: (updated: ScenarioData, changeDescription: string) => void;
  onResetDefaults: () => void;
  isUpdating: boolean;
  activityLog: ActivityLogEntry[];
  lastUpdateTimestamp: string;
}

export const LiveFestivalUpdates: React.FC<LiveFestivalUpdatesProps> = ({
  scenario,
  onUpdateScenario,
  onResetDefaults,
  isUpdating,
  activityLog,
  lastUpdateTimestamp,
}) => {
  const [showLog, setShowLog] = useState<boolean>(false);
  const [customTime, setCustomTime] = useState<string>('');
  const [timeInputError, setTimeInputError] = useState<string | null>(null);

  if (!scenario) return null;

  const currentCondition = scenario.weather.condition;
  const currentEndTime = scenario.festival_programme.scheduled_event_end_time;

  // Weather change handler
  const handleWeatherChange = (condition: WeatherCondition) => {
    if (condition === currentCondition) return;
    const updated: ScenarioData = JSON.parse(JSON.stringify(scenario));
    updated.weather.condition = condition;

    let multiplier = 1.0;
    let travelMult = 1.0;
    if (condition === 'heavy_rain') {
      multiplier = 1.4;
      travelMult = 1.25;
    } else if (condition === 'rainy' || condition === 'light_rain') {
      multiplier = 1.2;
      travelMult = 1.15;
    } else if (condition === 'cloudy') {
      multiplier = 1.05;
      travelMult = 1.0;
    }
    updated.weather.surge_concentration_factor = multiplier;
    updated.weather.travel_time_multiplier = travelMult;

    onUpdateScenario(
      updated,
      `Weather status changed to ${condition.replace('_', ' ').toUpperCase()} (Operator Reported)`
    );
  };

  // Delay change handler
  const handleDelayChange = (delayMinutes: number) => {
    // Standard baseline scheduled conclusion is 21:30
    const newTime = shiftTimeHHMM('21:30', delayMinutes);

    if (newTime === currentEndTime) return;

    const updated: ScenarioData = JSON.parse(JSON.stringify(scenario));
    updated.festival_programme.scheduled_event_end_time = newTime;
    updated.festival_programme.event_delay_minutes = delayMinutes;

    const desc =
      delayMinutes === 0
        ? `Event timing set to On Schedule (${formatTo12Hour(newTime)})`
        : `Event delayed by +${delayMinutes} mins (New conclusion: ${formatTo12Hour(newTime)})`;

    onUpdateScenario(updated, desc);
  };

  // Custom time submit with flexible 12-hour AM/PM and 24-hour parsing
  const handleCustomTimeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTimeInputError(null);
    if (!customTime.trim()) {
      setTimeInputError('Please enter a time (e.g. 12:19 pm or 21:30)');
      return;
    }

    const normalizedTime = parseAnyTimeToHHMM(customTime);
    if (!normalizedTime) {
      setTimeInputError('Please enter a valid time like 12:19 pm or 21:30');
      return;
    }

    if (normalizedTime === currentEndTime) {
      setTimeInputError(`Event is already scheduled for ${formatTo12Hour(normalizedTime)}`);
      return;
    }

    const updated: ScenarioData = JSON.parse(JSON.stringify(scenario));
    updated.festival_programme.scheduled_event_end_time = normalizedTime;
    onUpdateScenario(
      updated,
      `Event conclusion manually updated to ${formatTo12Hour(normalizedTime)} (${normalizedTime})`
    );
    setCustomTime('');
    setTimeInputError(null);
  };

  // Quick Action: Rain Started
  const handleRainStarted = () => {
    handleWeatherChange('rainy');
  };

  // Quick Action: Delay +30
  const handleDelay30 = () => {
    const newTime = shiftTimeHHMM(currentEndTime, 30);
    const updated: ScenarioData = JSON.parse(JSON.stringify(scenario));
    updated.festival_programme.scheduled_event_end_time = newTime;
    onUpdateScenario(
      updated,
      `Quick Action: Final Event delayed by +30 Minutes (New conclusion: ${formatTo12Hour(newTime)})`
    );
  };

  const getWeatherIcon = (cond: WeatherCondition) => {
    switch (cond) {
      case 'heavy_rain':
        return <CloudLightning className="w-4 h-4 text-purple-600" />;
      case 'rainy':
      case 'light_rain':
        return <CloudRain className="w-4 h-4 text-blue-600" />;
      case 'cloudy':
        return <Cloud className="w-4 h-4 text-slate-500" />;
      case 'clear':
      default:
        return <Sun className="w-4 h-4 text-amber-500" />;
    }
  };

  return (
    <section id="live-festival-updates" className="max-w-7xl mx-auto px-4 sm:px-6 py-2">
      <div className="bg-[#0a1120] text-white rounded-xl p-5 sm:p-6 shadow-xl border border-slate-800 space-y-5">
        
        {/* TOP STATUS BAR: REAL-TIME BADGES */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-white/10">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30 text-[11px] font-bold tracking-wider uppercase">
              <span className="w-2 h-2 rounded-full bg-orange-400 animate-ping"></span>
              <span>LIVE FESTIVAL UPDATES • CONSTRAINT 1 ACTIVE</span>
            </div>
            <h2 className="font-heading text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              <span>Live Operations Controller</span>
              {isUpdating && (
                <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-400/30 animate-pulse">
                  Recalculating without manual re-run...
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-300 max-w-2xl">
              Changes react automatically: when rain begins or ceremonies run late, crowd demand curves and bus movements recalculate instantly.
            </p>
          </div>

          {/* TELEMETRY READOUT PILLS */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Event End Time */}
            <div className="bg-slate-800/80 border border-white/10 rounded-lg px-3 py-1.5 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-sky-400" />
              <span>Event End: <strong className="font-mono text-white text-sm">{formatTo12Hour(currentEndTime)}</strong></span>
            </div>

            {/* Weather + Source */}
            <div className="bg-slate-800/80 border border-white/10 rounded-lg px-3 py-1.5 flex items-center gap-2">
              {getWeatherIcon(currentCondition)}
              <span className="capitalize">
                <strong>{currentCondition.replace('_', ' ')}</strong>{' '}
                <span className="text-slate-400 text-[11px] font-medium">(Operator Reported)</span>
              </span>
            </div>

            {/* Status Indicator */}
            <div className="bg-slate-800/80 border border-white/10 rounded-lg px-3 py-1.5 flex items-center gap-2">
              {isUpdating ? (
                <>
                  <Activity className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                  <span className="text-amber-300 font-semibold">Updating...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-300 font-semibold">Up to Date</span>
                </>
              )}
            </div>

            {/* Last Changed Clock */}
            <div className="text-[11px] text-slate-400 font-mono pl-1">
              Last Changed: <span className="text-slate-200">{lastUpdateTimestamp}</span>
            </div>
          </div>
        </div>

        {/* CONTROLS GRID */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          
          {/* 1. WEATHER SELECTOR */}
          <div className="md:col-span-4 bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <CloudRain className="w-3.5 h-3.5 text-sky-400" />
              <span>1. Weather Status (Surge Impact)</span>
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => handleWeatherChange('clear')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  currentCondition === 'clear'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                    : 'bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-white/10'
                }`}
              >
                <Sun className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>

              <button
                type="button"
                onClick={() => handleWeatherChange('cloudy')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  currentCondition === 'cloudy'
                    ? 'bg-slate-300 text-slate-950 font-bold shadow-md'
                    : 'bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-white/10'
                }`}
              >
                <Cloud className="w-3.5 h-3.5" />
                <span>Cloudy</span>
              </button>

              <button
                type="button"
                onClick={() => handleWeatherChange('rainy')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  currentCondition === 'rainy' || currentCondition === 'light_rain'
                    ? 'bg-sky-500 text-white font-bold shadow-md shadow-sky-500/20'
                    : 'bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-white/10'
                }`}
              >
                <CloudRain className="w-3.5 h-3.5" />
                <span>Rainy</span>
              </button>

              <button
                type="button"
                onClick={() => handleWeatherChange('heavy_rain')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  currentCondition === 'heavy_rain'
                    ? 'bg-purple-500 text-white font-bold shadow-md shadow-purple-500/20'
                    : 'bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-white/10'
                }`}
              >
                <CloudLightning className="w-3.5 h-3.5" />
                <span>Heavy Rain</span>
              </button>
            </div>
          </div>

          {/* 2. EVENT TIMING DELAY SELECTOR */}
          <div className="md:col-span-5 bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-orange-400" />
                <span>2. Event Conclusion Timing</span>
              </label>
              <span className="text-[11px] font-mono text-sky-300">Current: {formatTo12Hour(currentEndTime)}</span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => handleDelayChange(0)}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                  currentEndTime === '21:30'
                    ? 'bg-orange-600 text-white font-bold'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/10'
                }`}
              >
                On Schedule (9:30 PM)
              </button>

              <button
                type="button"
                onClick={() => handleDelayChange(15)}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                  currentEndTime === '21:45'
                    ? 'bg-orange-600 text-white font-bold'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/10'
                }`}
              >
                +15 Min (9:45 PM)
              </button>

              <button
                type="button"
                onClick={() => handleDelayChange(30)}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                  currentEndTime === '22:00'
                    ? 'bg-orange-600 text-white font-bold'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/10'
                }`}
              >
                +30 Min (10:00 PM)
              </button>

              <button
                type="button"
                onClick={() => handleDelayChange(60)}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                  currentEndTime === '22:30'
                    ? 'bg-orange-600 text-white font-bold'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/10'
                }`}
              >
                +60 Min (10:30 PM)
              </button>
            </div>

            {/* Custom time input accepting both 12-hour AM/PM and 24-hour */}
            <form onSubmit={handleCustomTimeSubmit} className="space-y-1.5 pt-1">
              <div className="flex gap-1.5">
                <input
                  type="text"
                  placeholder="e.g. 12:19 pm or 21:30"
                  value={customTime}
                  onChange={(e) => {
                    setCustomTime(e.target.value);
                    if (timeInputError) setTimeInputError(null);
                  }}
                  className="flex-1 px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs font-mono text-white placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded bg-sky-700 hover:bg-sky-600 border border-sky-500/50 text-xs text-white font-semibold shadow-sm transition-all flex items-center gap-1"
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Set Time</span>
                </button>
              </div>
              {timeInputError && (
                <p className="text-[11px] text-red-300 font-medium flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                  <span>{timeInputError}</span>
                </p>
              )}
            </form>
          </div>

          {/* 3. QUICK ACTIONS */}
          <div className="md:col-span-3 bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>3. One-Click Quick Actions</span>
            </label>

            <div className="space-y-1.5">
              <button
                type="button"
                onClick={handleRainStarted}
                className="w-full px-3 py-1.5 rounded-lg bg-sky-600/80 hover:bg-sky-600 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-sm"
              >
                <CloudRain className="w-3.5 h-3.5" />
                <span>"Rain Started"</span>
              </button>

              <button
                type="button"
                onClick={handleDelay30}
                className="w-full px-3 py-1.5 rounded-lg bg-orange-600/80 hover:bg-orange-600 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-sm"
              >
                <Clock className="w-3.5 h-3.5" />
                <span>"Final Event Delayed +30 Min"</span>
              </button>

              <button
                type="button"
                onClick={onResetDefaults}
                className="w-full px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all border border-white/10"
              >
                <RotateCcw className="w-3 h-3 text-slate-400" />
                <span>Reset to Scenario Defaults</span>
              </button>
            </div>
          </div>

        </div>

        {/* LOG DRAWER TOGGLE */}
        <div className="flex justify-between items-center pt-1 border-t border-white/10 text-xs">
          <div className="flex items-center gap-2 text-slate-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            <span>Automatic pipeline recalculation active: zero manual re-runs needed.</span>
          </div>

          <button
            onClick={() => setShowLog(!showLog)}
            className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 font-semibold"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{showLog ? 'Hide Activity Log' : `Live Operations Log (${activityLog.length})`}</span>
            {showLog ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* REAL-TIME AUDIT LOG DRAWER */}
        {showLog && (
          <div className="bg-slate-950/80 border border-white/10 rounded-xl p-3.5 space-y-2 max-h-48 overflow-y-auto custom-scrollbar animate-fadeIn">
            <div className="flex justify-between items-center text-[11px] font-bold text-slate-400 border-b border-white/10 pb-1.5">
              <span>REAL-TIME AUDIT TRAIL</span>
              <span>Total recorded: {activityLog.length} events</span>
            </div>

            <div className="space-y-1.5">
              {activityLog.length === 0 ? (
                <div className="text-center py-4 text-xs text-slate-500">
                  No operational updates recorded yet for this session.
                </div>
              ) : (
                activityLog.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start justify-between gap-3 text-xs font-mono py-1 border-b border-white/5"
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-slate-500 font-semibold text-[11px] flex-shrink-0">
                        [{log.timestamp}]
                      </span>
                      <span className="text-slate-200">
                        <strong>{log.action}</strong>: {log.details}
                      </span>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-sky-300 flex-shrink-0 uppercase">
                      {log.type}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

      </div>
    </section>
  );
};

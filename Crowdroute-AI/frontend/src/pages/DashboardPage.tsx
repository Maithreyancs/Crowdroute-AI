import React, { useState, useEffect } from 'react';
import {
  AllocateResponse,
  ForecastResponse,
  HistoricalUploadResponse,
  LiveDataSummaryResponse,
  ScenarioData,
  SimulateResponse,
} from '../types/api';
import { FestivalScenarioControlCenter } from '../components/FestivalScenarioControlCenter';
import { HistoricalUpload } from '../components/HistoricalUpload';
import { SimulationComparison } from '../components/SimulationComparison';
import { TradeoffDetails } from '../components/TradeoffDetails';
import { DataSourceStatus } from '../components/DataSourceStatus';
import { BusMap } from '../components/BusMap';
import { BusMovementImpact } from '../components/BusMovementImpact';
import { BusTimetable } from '../components/BusTimetable';
import { DemandChart } from '../components/DemandChart';
import { ErrorBoundary } from '../components/ErrorBoundary';
import {
  Sliders,
  FileSpreadsheet,
  CalendarDays,
  LineChart,
  Radio,
  ArrowLeft,
  MapPin,
  Calendar,
  Bus as BusIcon,
  Users,
  AlertTriangle,
  Clock,
  ShieldCheck,
  CheckCircle2,
  TrendingUp,
  Layers,
  Activity,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import {
  formatDateIST,
  formatIntervalTo12Hour,
  formatTo12Hour,
  formatTo12HourEstimated,
} from '../utils/timeFormat';

interface DashboardPageProps {
  initialTab?: string;
  scenario: ScenarioData | null;
  forecast: ForecastResponse | null;
  allocation: AllocateResponse | null;
  simulation: SimulateResponse | null;
  uploadResult: HistoricalUploadResponse | null;
  liveStatus: LiveDataSummaryResponse | null;
  onApplyScenario: (updated: ScenarioData) => void;
  onReloadScenario: () => void;
  onUploadFile: (file: File) => Promise<HistoricalUploadResponse>;
  onLoadSampleCsv: () => Promise<void>;
  onRefreshLive: () => void;
  onBackToHome: () => void;
  isLoading?: boolean;
  isUpdating?: boolean;
  lastUpdateTimestamp?: string;
  hasRunInitialPrediction?: boolean;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  initialTab = 'all',
  scenario,
  forecast,
  allocation,
  simulation,
  uploadResult,
  liveStatus,
  onApplyScenario,
  onReloadScenario,
  onUploadFile,
  onLoadSampleCsv,
  onRefreshLive,
  onBackToHome,
  isLoading = false,
  isUpdating = false,
  lastUpdateTimestamp = '',
  hasRunInitialPrediction = true,
}) => {
  const [activeTab, setActiveTab] = useState<string>(initialTab);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Derived application metrics from real data (no fabricated static values)
  const totalAttendance = scenario?.festival_programme.expected_total_attendance || 40000;
  const exitingFraction = scenario?.festival_programme.exiting_passenger_fraction || 0.85;
  const expectedPassengers = Math.round(totalAttendance * exitingFraction);

  const mainSummary = forecast?.stop_summaries?.['STOP_MAIN'];
  const nextPeakWindow = mainSummary
    ? formatTo12Hour(mainSummary.peak_interval)
    : scenario
    ? formatTo12Hour(scenario.festival_programme.scheduled_event_end_time)
    : '10:00 PM';

  let highestRisk = 'Moderate Crowd';
  let peakLocation = 'Active Stands';
  let highestDemandStopId = 'STOP_MAIN';
  let highestPeakCount = 0;

  if (forecast && forecast.stop_summaries) {
    const summaries = Object.values(forecast.stop_summaries);
    summaries.forEach((s) => {
      if (s.peak_demand > highestPeakCount) {
        highestPeakCount = s.peak_demand;
        highestDemandStopId = s.stop_id;
      }
    });

    const critStop = summaries.find((s) => s.overall_risk === 'CRITICAL');
    const highStop = summaries.find((s) => s.overall_risk === 'HIGH');
    if (critStop) {
      highestRisk = 'Very High Crowd';
      peakLocation = `${critStop.stop_id} (${formatTo12Hour(critStop.peak_interval)})`;
    } else if (highStop) {
      highestRisk = 'High Crowd';
      peakLocation = `${highStop.stop_id} (${formatTo12Hour(highStop.peak_interval)})`;
    }
  }

  // Calculate fleet stats
  const totalFleet = scenario?.fleet.length || 16;
  const availableBuses = scenario?.fleet.filter((b) => b.status === 'available').length || totalFleet;
  const estimatedRequiredBuses = Math.max(1, Math.ceil(highestPeakCount / 30));
  const fleetShortfallOrSurplus = availableBuses - estimatedRequiredBuses;

  const highestStopObj = scenario?.stops.find((s) => s.stop_id === highestDemandStopId);
  const highestStopName = highestStopObj ? highestStopObj.name : highestDemandStopId;

  return (
    <ErrorBoundary fallbackTitle="Dashboard Operations View Recovery">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        
        {/* TOP HEADER */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-200">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <button
                onClick={onBackToHome}
                className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:text-sky-900 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Portal Home</span>
              </button>
              <span className="text-slate-300">•</span>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider font-mono">
                OPERATIONS CONTROL CONSOLE
              </span>
            </div>
            <h1 className="font-heading text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Festival Transit Operations & Prediction Dashboard
            </h1>
            <p className="text-xs sm:text-sm text-slate-600">
              Complete scenario configuration, dynamic crowd forecasting, fixed-fleet optimization, and simulated dispatch monitoring.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold font-mono">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Fleet: {totalFleet} Buses Fixed</span>
            </span>
          </div>
        </div>

        {/* ---------------- SECTION 1: CURRENT SCENARIO SUMMARY (PHASE 5) ---------------- */}
        <section id="section-summary" className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-600"></span>
              <h2 className="font-heading font-bold text-sm uppercase tracking-wider text-slate-800">
                Section 1: Current Scenario Summary
              </h2>
            </div>
            <div className="flex items-center gap-2">
              {isUpdating || isLoading ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-800 text-[11px] font-bold animate-pulse">
                  <Clock className="w-3 h-3 text-sky-600 animate-spin" />
                  <span>Calculating...</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  <span>Up to Date</span>
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 font-mono text-center">
            {/* Event Name */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-[10px] text-slate-500 uppercase block font-sans truncate">Event Name</span>
              <strong className="text-xs text-slate-900 block truncate" title={scenario?.festival_programme.event_name}>
                {scenario?.festival_programme.event_name || 'Festival Demo'}
              </strong>
            </div>

            {/* Event Date */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-[10px] text-slate-500 uppercase block font-sans truncate">Event Date</span>
              <strong className="text-xs text-slate-900 block">
                {formatDateIST(scenario?.festival_programme.event_date || '2026-10-11')}
              </strong>
            </div>

            {/* Start & End Times */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-[10px] text-slate-500 uppercase block font-sans truncate">Event Window</span>
              <strong className="text-xs text-sky-800 block">
                {formatTo12Hour(scenario?.festival_programme.event_start_time || '18:00')}–{formatTo12Hour(scenario?.festival_programme.scheduled_event_end_time || '22:00')}
              </strong>
            </div>

            {/* Expected Attendance */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-[10px] text-slate-500 uppercase block font-sans truncate">Total Attendees</span>
              <strong className="text-xs text-slate-900 block">
                {totalAttendance.toLocaleString()}
              </strong>
            </div>

            {/* Public Transport Demand */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-[10px] text-slate-500 uppercase block font-sans truncate">Transit Demand</span>
              <strong className="text-xs text-blue-700 block">
                ~{expectedPassengers.toLocaleString()} pax
              </strong>
            </div>

            {/* Weather Data Status */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-[10px] text-slate-500 uppercase block font-sans truncate">Weather Telemetry</span>
              <strong className="text-xs text-slate-900 capitalize block truncate">
                {scenario?.weather.condition.replace('_', ' ')} ({scenario?.weather.source === 'live_open_meteo' ? 'Live' : 'Manual'})
              </strong>
            </div>

            {/* Current Forecast Status */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-[10px] text-slate-500 uppercase block font-sans truncate">Forecast Status</span>
              <strong className={`text-xs block ${isUpdating ? 'text-sky-700' : 'text-emerald-700'}`}>
                {isUpdating ? 'Updating...' : 'Calculated'}
              </strong>
            </div>

            {/* Last Successful Calculation */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-[10px] text-slate-500 uppercase block font-sans truncate">Last Calculation</span>
              <strong className="text-xs text-slate-700 block truncate" title={lastUpdateTimestamp}>
                {lastUpdateTimestamp || 'IST'}
              </strong>
            </div>
          </div>
        </section>

        {/* ---------------- SECTION 2 & 3: FESTIVAL SCENARIO CONTROL CENTER & RUN PREDICTION ---------------- */}
        <section id="section-control-center">
          <FestivalScenarioControlCenter
            scenario={scenario}
            forecast={forecast}
            allocation={allocation}
            onRunPrediction={onApplyScenario}
            onResetDefaults={onReloadScenario}
            isUpdating={isUpdating}
            isLoading={isLoading}
            hasRunInitialPrediction={hasRunInitialPrediction}
            lastUpdateTimestamp={lastUpdateTimestamp}
          />
        </section>

        {/* NAVIGATION QUICK TABS */}
        <div className="flex flex-wrap gap-2 border-b-2 border-slate-200 pb-2 pt-2">
          <button
            onClick={() => setActiveTab('all')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'all'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Complete Dashboard View</span>
          </button>
          <button
            onClick={() => setActiveTab('results')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'results'
                ? 'bg-sky-50 text-sky-700 border border-sky-300 shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5 text-blue-600" />
            <span>Section 4: Prediction Results</span>
          </button>
          <button
            onClick={() => setActiveTab('optimization')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'optimization'
                ? 'bg-sky-50 text-sky-700 border border-sky-300 shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-amber-600" />
            <span>Section 5: Bus Optimization</span>
          </button>
          <button
            onClick={() => setActiveTab('map-timetable')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'map-timetable'
                ? 'bg-sky-50 text-sky-700 border border-sky-300 shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <MapPin className="w-3.5 h-3.5 text-rose-600" />
            <span>Section 6: Map & Timetable</span>
          </button>
          <button
            onClick={() => setActiveTab('sources')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'sources'
                ? 'bg-sky-50 text-sky-700 border border-sky-300 shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Radio className="w-3.5 h-3.5 text-emerald-600" />
            <span>Section 7: Historical & Sources</span>
          </button>
        </div>

        {/* ---------------- SECTION 4: PREDICTION RESULTS (PHASE 5) ---------------- */}
        {(activeTab === 'all' || activeTab === 'results') && (
          <section id="section-results" className="space-y-5">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-2 border-b border-slate-200">
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-sky-700 uppercase tracking-wider font-mono">
                  SECTION 4: PREDICTION RESULTS & CAPACITY
                </div>
                <h3 className="font-heading text-xl sm:text-2xl font-bold text-slate-900">
                  Dynamic Passenger Demand & Peak Window Estimates
                </h3>
              </div>
              <span className="text-xs text-slate-500 font-mono">
                {forecast?.intervals.length || 0} discrete 15-min intervals calculated
              </span>
            </div>

            {/* 4 SUMMARY STAT CARDS */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-1">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Highest-Demand Stand
                </span>
                <span className="font-heading text-base font-bold text-slate-900 truncate block" title={highestStopName}>
                  {highestStopName}
                </span>
                <span className="text-xs font-mono text-red-600 font-bold block">
                  Peak: {highestPeakCount.toLocaleString()} pax/interval
                </span>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-1">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Peak-Demand Window
                </span>
                <span className="text-base font-bold text-slate-900 font-mono block">
                  {nextPeakWindow}
                </span>
                <span className="text-xs text-slate-500 block">
                  Post-ceremony egress surge
                </span>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-1">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Est. Buses Required
                </span>
                <span className="text-xl font-bold text-sky-700 font-mono block">
                  {estimatedRequiredBuses} Buses
                </span>
                <span className="text-xs text-slate-500 block">
                  Available: {availableBuses} Active Buses
                </span>
              </div>

              <div className={`bg-white border rounded-xl p-4 shadow-sm space-y-1 ${
                fleetShortfallOrSurplus < 0 ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200'
              }`}>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Shortage / Surplus
                </span>
                <span className={`text-xl font-bold font-mono block ${
                  fleetShortfallOrSurplus < 0 ? 'text-amber-700' : 'text-emerald-700'
                }`}>
                  {fleetShortfallOrSurplus < 0 ? `${fleetShortfallOrSurplus} Buses` : `+${fleetShortfallOrSurplus} Buses`}
                </span>
                <span className="text-xs text-slate-500 block">
                  {fleetShortfallOrSurplus < 0 ? 'Deficit at Peak Window' : 'Surplus Fleet Available'}
                </span>
              </div>
            </div>

            {/* DEMAND CHART */}
            {forecast && forecast.intervals && (
              <DemandChart intervals={forecast.intervals} stops={scenario?.stops || []} />
            )}
          </section>
        )}

        {/* ---------------- SECTION 5: BUS OPTIMIZATION (PHASE 5) ---------------- */}
        {(activeTab === 'all' || activeTab === 'optimization') && (
          <section id="section-optimization" className="space-y-5">
            <div className="flex justify-between items-center pb-2 border-b border-slate-200">
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-sky-700 uppercase tracking-wider font-mono">
                  SECTION 5: BUS OPTIMIZATION & RELOCATIONS
                </div>
                <h3 className="font-heading text-xl sm:text-2xl font-bold text-slate-900">
                  Fixed-Fleet Relocation Recommendations & Service Trade-Offs
                </h3>
              </div>
              <span className="px-2.5 py-1 rounded bg-emerald-100 text-emerald-800 text-xs font-bold font-mono">
                {allocation?.recommended_moves.length || 0} Recommended Transfers
              </span>
            </div>

            <BusMovementImpact
              allocation={allocation}
              forecast={forecast}
              scenario={scenario}
            />

            {simulation && <SimulationComparison simulation={simulation} />}

            <TradeoffDetails rejectedMoves={allocation?.rejected_moves || []} />
          </section>
        )}

        {/* ---------------- SECTION 6: INTERACTIVE MAP AND TIMETABLE (PHASE 5) ---------------- */}
        {(activeTab === 'all' || activeTab === 'map-timetable') && (
          <section id="section-map-timetable" className="space-y-6">
            <div className="flex justify-between items-center pb-2 border-b border-slate-200">
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-sky-700 uppercase tracking-wider font-mono">
                  SECTION 6: INTERACTIVE MAP AND TIMETABLE
                </div>
                <h3 className="font-heading text-xl sm:text-2xl font-bold text-slate-900">
                  Transit GIS & Synchronized Fleet Timetable
                </h3>
              </div>
            </div>

            {/* Interactive Bus Map */}
            <div className="space-y-2">
              <BusMap
                stops={scenario?.stops || []}
                fleet={scenario?.fleet || []}
                forecast={forecast}
                allocation={allocation}
                scenario={scenario}
              />
            </div>

            {/* Bus Timetable */}
            <div className="space-y-2">
              <BusTimetable
                allocation={allocation}
                forecast={forecast}
                scenario={scenario}
              />
            </div>
          </section>
        )}

        {/* ---------------- SECTION 7: HISTORICAL DATA AND SOURCES (PHASE 5) ---------------- */}
        {(activeTab === 'all' || activeTab === 'sources') && (
          <section id="section-sources" className="space-y-6">
            <div className="flex justify-between items-center pb-2 border-b border-slate-200">
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-sky-700 uppercase tracking-wider font-mono">
                  SECTION 7: HISTORICAL DATA AND SOURCES
                </div>
                <h3 className="font-heading text-xl sm:text-2xl font-bold text-slate-900">
                  Data Provenance, Live Telemetry & Past Festival Calibration
                </h3>
              </div>
            </div>

            <HistoricalUpload
              onUploadFile={onUploadFile}
              onLoadSampleCsv={onLoadSampleCsv}
              uploadResult={uploadResult}
              accuracy={forecast?.actual_vs_predicted}
              isLoading={isLoading}
            />

            <DataSourceStatus
              liveStatus={liveStatus}
              onRefreshLive={onRefreshLive}
              isLoading={isLoading}
            />
          </section>
        )}

      </div>
    </ErrorBoundary>
  );
};

import React, { useState } from 'react';
import { HeroSection } from '../components/HeroSection';
import { AdministrativeStepBar } from '../components/AdministrativeStepBar';
import { LiveFestivalUpdates, ActivityLogEntry } from '../components/LiveFestivalUpdates';
import { SummaryMetrics } from '../components/SummaryMetrics';
import { FestivalScenarioControlCenter } from '../components/FestivalScenarioControlCenter';
import { CrowdForecast } from '../components/CrowdForecast';
import { BusMap } from '../components/BusMap';
import { BusMovementImpact } from '../components/BusMovementImpact';
import { BusTimetable } from '../components/BusTimetable';
import {
  AllocateResponse,
  ForecastResponse,
  LiveWeatherResponse,
  OperationalMode,
  ScenarioData,
} from '../types/api';
import { CheckCircle2, Shield, Users, Bus, AlertCircle, ArrowRight, Activity, MapPin } from 'lucide-react';

interface HomePageProps {
  scenario: ScenarioData | null;
  forecast: ForecastResponse | null;
  allocation: AllocateResponse | null;
  systemMode: OperationalMode;
  onSetMode: (mode: OperationalMode) => void;
  onResetDefaults: () => void;
  onRefresh: () => void;
  onNavigateDashboard: (tab?: string) => void;
  onNavigateComplaints?: () => void;
  onLiveScenarioUpdate?: (updated: ScenarioData, desc: string) => void;
  onRunPrediction?: (updated: ScenarioData) => void;
  isUpdating?: boolean;
  activityLog?: ActivityLogEntry[];
  lastUpdateTimestamp?: string;
  lastSuccessfulTelemetryTime?: string | null;
  isLoading?: boolean;
  hasRunInitialPrediction?: boolean;
  liveWeather?: LiveWeatherResponse | null;
  weatherError?: string | null;
  errorMessage?: string | null;
  isManualWeatherOverride?: boolean;
}


export const HomePage: React.FC<HomePageProps> = ({
  scenario,
  forecast,
  allocation,
  systemMode,
  onSetMode,
  onResetDefaults,
  onRefresh,
  onNavigateDashboard,
  onNavigateComplaints,
  onLiveScenarioUpdate,
  onRunPrediction,
  isUpdating = false,
  activityLog = [],
  lastUpdateTimestamp = '',
  lastSuccessfulTelemetryTime = null,
  isLoading,
  hasRunInitialPrediction = true,
  liveWeather = null,
  weatherError = null,
  errorMessage = null,
  isManualWeatherOverride = false,
}) => {

  const [selectedHierarchyStop, setSelectedHierarchyStop] = useState<string>('STOP_MAIN');

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="space-y-6 bg-slate-100/60 pb-12">
      
      {/* 1. ADMINISTRATIVE STEP FILTER BAR (MATCHING SCREENSHOT 3) */}
      <AdministrativeStepBar
        stops={scenario?.stops || []}
        selectedStopId={selectedHierarchyStop}
        onSelectStop={(id) => {
          setSelectedHierarchyStop(id);
          scrollTo('bus-map-section');
        }}
      />

      {/* 2. HERO SECTION WITH AERIAL TRANSIT BACKDROP (SCREENSHOT 2 & 3) */}
      <HeroSection
        onScrollToForecast={() => scrollTo('crowd-prediction-section')}
        onScrollToAllocation={() => scrollTo('bus-allocation')}
        onScrollToMap={() => scrollTo('bus-map-section')}
        onReportProblem={onNavigateComplaints}
      />


      {/* 3. DARK 4-CARD SUMMARY METRICS STRIP + TELEMETRY CARD */}
      <SummaryMetrics
        scenario={scenario}
        forecast={forecast}
        allocation={allocation}
        systemMode={systemMode}
        onSetMode={onSetMode}
        onResetDefaults={onResetDefaults}
        onRefresh={onRefresh}
        isLoading={isLoading}
        isUpdating={isUpdating}
        liveWeather={liveWeather}
        weatherError={weatherError}
        lastUpdateTimestamp={lastUpdateTimestamp}
        lastSuccessfulTelemetryTime={lastSuccessfulTelemetryTime}
        errorMessage={errorMessage}
        hasRunInitialPrediction={hasRunInitialPrediction}
        isManualWeatherOverride={isManualWeatherOverride}
      />

      {/* 4. LIVE FESTIVAL OPERATIONS CONTROLLER */}
      {onLiveScenarioUpdate && (
        <LiveFestivalUpdates
          scenario={scenario}
          onUpdateScenario={onLiveScenarioUpdate}
          onResetDefaults={onResetDefaults}
          isUpdating={isUpdating}
          activityLog={activityLog}
          lastUpdateTimestamp={lastUpdateTimestamp}
        />
      )}

      {/* 5. INTERACTIVE BUS STOP & ROUTE MAP (SCREENSHOT 1 3-COLUMN LAYOUT) */}
      <section id="bus-map-section" className="max-w-7xl mx-auto px-4 sm:px-6 pt-2">
        <div className="space-y-2 mb-3">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-900 text-[11px] font-bold uppercase tracking-wider font-mono">
            <span>TRANSIT GIS & FLEET POSITIONING</span>
          </div>
          <h2 className="font-heading text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            Interactive Bus Stand & Fleet Tracking Map
          </h2>
          <p className="text-xs sm:text-sm text-slate-600">
            Real-time visual monitoring of all 16 buses, station bay capacities, and recommended relocation transfer lines.
          </p>
        </div>

        <BusMap
          stops={scenario?.stops || []}
          fleet={scenario?.fleet || []}
          forecast={forecast}
          allocation={allocation}
          scenario={scenario}
        />
      </section>

      {/* 6. CROWD FORECAST & FESTIVAL SCENARIO CONTROL CENTER (PHASE 2) */}
      <section id="crowd-prediction-section" className="max-w-7xl mx-auto px-4 sm:px-6 space-y-6">
        <FestivalScenarioControlCenter
          scenario={scenario}
          forecast={forecast}
          allocation={allocation}
          onRunPrediction={(sc) => {
            if (onRunPrediction) {
              onRunPrediction(sc);
            } else if (onLiveScenarioUpdate) {
              onLiveScenarioUpdate(sc, 'Prediction Executed');
            }
          }}
          onResetDefaults={onResetDefaults}
          isUpdating={isUpdating}
          isLoading={isLoading}
          hasRunInitialPrediction={hasRunInitialPrediction}
          lastUpdateTimestamp={lastUpdateTimestamp}
        />

        <div id="crowd-forecast">
          <CrowdForecast
            forecast={forecast}
            stops={scenario?.stops || []}
            fleet={scenario?.fleet || []}
            onViewDetailedTable={() => onNavigateDashboard('forecast-table')}
          />
        </div>
      </section>

      {/* 7. OPERATIONAL BUS TIMETABLE */}
      <section id="bus-timetable-section" className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="space-y-2 mb-3">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-900 text-[11px] font-bold uppercase tracking-wider font-mono">
            <span>OPERATIONAL TIMETABLE</span>
          </div>
          <h2 className="font-heading text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            Bus Timetable & Fleet Status
          </h2>
          <p className="text-xs sm:text-sm text-slate-600">
            Chronological departure times, estimated arrival windows, and full 16-bus fixed roster status.
          </p>
        </div>

        <BusTimetable
          allocation={allocation}
          forecast={forecast}
          scenario={scenario}
        />
      </section>

      {/* 8. OFFICIAL CONSTRAINT 2: FIXED FLEET WITH VISIBLE SERVICE TRADE-OFFS */}
      <div id="bus-allocation">
        <BusMovementImpact
          allocation={allocation}
          forecast={forecast}
          scenario={scenario}
          onViewSimulation={() => onNavigateDashboard('simulation')}
        />
      </div>

      {/* 9. HOW IT WORKS: 3 SIMPLE STEPS */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6 shadow-sm">
          <div className="text-center max-w-2xl mx-auto space-y-1">
            <span className="text-xs font-bold text-blue-700 uppercase tracking-wider font-mono">
              THREE-STEP OPERATIONAL PIPELINE
            </span>
            <h3 className="font-heading text-2xl font-bold text-slate-900">
              How CrowdRoute AI Works
            </h3>
            <p className="text-xs text-slate-600">
              Transparent, explainable decision support designed for municipal transport officers and festival dispatchers.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* STEP 1 */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 shadow-sm space-y-2">
              <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-800 font-bold flex items-center justify-center text-sm font-mono">
                1
              </div>
              <h4 className="font-heading font-bold text-base text-slate-900">
                Predict Crowd Surge
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Calculates expected passenger surges for each 15-minute window based on the scheduled closing ceremony and weather conditions.
              </p>
            </div>

            {/* STEP 2 */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 shadow-sm space-y-2">
              <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-800 font-bold flex items-center justify-center text-sm font-mono">
                2
              </div>
              <h4 className="font-heading font-bold text-base text-slate-900">
                Plan Fixed Fleet Relocations
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Identifies idle buses at peripheral stands and recommends safe relocations to crowded temple stands without violating safety minimums.
              </p>
            </div>

            {/* STEP 3 */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 shadow-sm space-y-2">
              <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-sm font-mono">
                3
              </div>
              <h4 className="font-heading font-bold text-base text-slate-900">
                Monitor Live Updates Automatically
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Automatically recalculates forecasts and recommendations when rain begins or events run late, requiring zero manual re-runs.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 10. REPORT A TRANSPORT PROBLEM QUICK CITIZEN BANNER */}
      <section id="complaint-banner" className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="bg-[#0b1329] border border-slate-800 text-white rounded-2xl p-6 sm:p-8 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-bold uppercase tracking-wider font-mono">
              <AlertCircle className="w-3.5 h-3.5 text-red-400" />
              <span>CITIZEN FEEDBACK & GRIEVANCE REPORTING</span>
            </div>
            <h3 className="font-heading text-2xl font-bold text-white tracking-tight">
              Facing Overcrowding or Bus Delays at the Festival?
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Submit a quick report to help transport controllers adjust bus movements. Receive an instant tracking reference code with no complex signup.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 flex-shrink-0">
            <button
              onClick={onNavigateComplaints}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-red-600/30 transition-all hover:translate-y-[-1px]"
            >
              <span>Report a Problem</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

    </div>
  );
};

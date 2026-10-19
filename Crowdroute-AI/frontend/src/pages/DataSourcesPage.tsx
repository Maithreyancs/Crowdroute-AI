import React from 'react';
import {
  Sliders,
  Database,
  FileSpreadsheet,
  CloudSun,
  ShieldCheck,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { LiveDataSummaryResponse, ScenarioData, HistoricalUploadResponse } from '../types/api';
import { formatTo12Hour } from '../utils/timeFormat';

interface DataSourcesPageProps {
  scenario: ScenarioData | null;
  liveStatus: LiveDataSummaryResponse | null;
  uploadResult: HistoricalUploadResponse | null;
  onRefreshLive: () => void;
  onBackToHome: () => void;
  onNavigatePastData: () => void;
  isLoading?: boolean;
}

export const DataSourcesPage: React.FC<DataSourcesPageProps> = ({
  scenario,
  liveStatus,
  uploadResult,
  onRefreshLive,
  onBackToHome,
  onNavigatePastData,
  isLoading = false,
}) => {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      
      {/* 1. PAGE HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-200">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <button
              onClick={onBackToHome}
              className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:text-sky-900"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Portal Home</span>
            </button>
            <span className="text-slate-300">•</span>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              GOVERNMENT DATA TRANSPARENCY
            </span>
          </div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            Data Sources & Provenance Report
          </h1>
          <p className="text-sm text-slate-600 max-w-3xl">
            Complete transparency on the sources powering crowd forecasts, bus relocation recommendations, and fleet capacity calculations.
          </p>
        </div>

        <button
          onClick={onRefreshLive}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-semibold shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Check Feed Status</span>
        </button>
      </div>

      {/* 2. ETHICS & CITIZEN TRANSPARENCY STATEMENT */}
      <div className="bg-sky-50 border-l-4 border-sky-600 rounded-r-xl p-5 text-sm text-sky-950 space-y-2">
        <div className="flex items-center gap-2 font-bold text-sky-900">
          <ShieldCheck className="w-5 h-5 text-sky-700" />
          <span>Public Transparency Principle</span>
        </div>
        <p className="text-xs sm:text-sm text-sky-800 leading-relaxed">
          In compliance with civic open-governance standards, CrowdRoute AI strictly distinguishes between 
          <strong> user-entered scenario parameters</strong>, <strong>synthetic demonstration estimates</strong>, 
          <strong>uploaded historical ticketing records</strong>, and <strong>live external telemetry</strong>. 
          Synthetic data is clearly identified and never misrepresented as official passenger counts.
        </p>
      </div>

      {/* 3. FOUR DISTINCT DATA SOURCES SECTION */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* SOURCE 1: USER-ENTERED SCENARIO VALUES */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
          <div className="flex justify-between items-start gap-2 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center">
                <Sliders className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-heading font-bold text-base text-slate-900">
                  User-Entered Scenario Values
                </h3>
                <span className="text-xs text-slate-500">
                  Transport Controller Parameters
                </span>
              </div>
            </div>
            <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
              ACTIVE
            </span>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            Values directly entered or modified by transit officers, including expected festival attendance, event closing timings, weather multipliers, bus availability, and stop split shares.
          </p>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-1.5 font-mono">
            <div className="flex justify-between text-slate-700">
              <span>Festival Attendance:</span>
              <strong className="text-slate-900">{scenario?.festival_programme.expected_total_attendance.toLocaleString() || '40,000'} persons</strong>
            </div>
            <div className="flex justify-between text-slate-700">
              <span>Event Scheduled End:</span>
              <strong className="text-slate-900">{formatTo12Hour(scenario?.festival_programme.scheduled_event_end_time || '21:30')}</strong>
            </div>
            <div className="flex justify-between text-slate-700">
              <span>Configured Bus Stops:</span>
              <strong className="text-slate-900">{scenario?.stops.length || 3} monitored stands</strong>
            </div>
            <div className="flex justify-between text-slate-700">
              <span>Active Bus Fleet:</span>
              <strong className="text-slate-900">{scenario?.fleet.length || 16} buses</strong>
            </div>
          </div>

          <div className="text-[11px] text-slate-500">
            ✓ Overrides synthetic defaults when saved in the Scenario & Fleet Editor.
          </div>
        </div>

        {/* SOURCE 2: SYNTHETIC DEMONSTRATION VALUES */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
          <div className="flex justify-between items-start gap-2 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-heading font-bold text-base text-slate-900">
                  Synthetic Demonstration Values
                </h3>
                <span className="text-xs text-slate-500">
                  Baseline Planning Model
                </span>
              </div>
            </div>
            <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
              DEMO DATA
            </span>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            Deterministic reference demonstration based on the Maha Deepam temple festival finale. Built using calibrated Gaussian egress curves and verified municipal stop coordinates.
          </p>

          <div className="bg-amber-50/60 border border-amber-200 rounded-lg p-3 text-xs space-y-1.5 text-amber-900">
            <div className="font-bold flex items-center gap-1 text-amber-950">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              <span>Demonstration Disclaimer</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              All passenger counts, road travel times, and fleet behaviors are synthetic planning estimates. 
              They are intended solely for testing decision-support algorithms and must not be interpreted as official census or actual telemetry.
            </p>
          </div>

          <div className="text-[11px] text-slate-500">
            ✓ Strictly enforces zero-phantom bus conservation (16 buses conserved).
          </div>
        </div>

        {/* SOURCE 3: UPLOADED HISTORICAL RECORDS */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
          <div className="flex justify-between items-start gap-2 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-heading font-bold text-base text-slate-900">
                  Uploaded Historical Records
                </h3>
                <span className="text-xs text-slate-500">
                  CSV & Excel Boarding Data
                </span>
              </div>
            </div>
            <span
              className={`px-2.5 py-0.5 rounded text-xs font-bold border ${
                uploadResult && uploadResult.status !== 'INVALID_FILE'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-slate-100 text-slate-700 border-slate-200'
              }`}
            >
              {uploadResult && uploadResult.status !== 'INVALID_FILE' ? 'INGESTED' : 'NOT LOADED'}
            </span>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            Historical ticketing logs, turnstile taps, or conductor tally sheets from previous festivals. Used to calibrate interval departure distributions empirically.
          </p>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-1 text-slate-700 font-mono">
            {uploadResult ? (
              <>
                <div>File: <strong>{uploadResult.filename}</strong></div>
                <div>Ingested Records: <strong>{uploadResult.records.length} rows</strong></div>
                <div>Valid Passenger Total: <strong>{uploadResult.total_passenger_count.toLocaleString()} pax</strong></div>
                <div>Stop IDs Covered: <strong>{uploadResult.stop_ids_found.join(', ')}</strong></div>
              </>
            ) : (
              <div className="text-slate-500 italic font-sans text-xs">
                No external historical dataset currently uploaded. You can load our synthetic historical demo dataset or upload a CSV file in Past Crowd Data.
              </div>
            )}
          </div>

          <div className="flex justify-between items-center pt-1">
            <button
              onClick={onNavigatePastData}
              className="text-xs font-semibold text-sky-700 hover:text-sky-900 inline-flex items-center gap-1"
            >
              <span>Manage Past Crowd Data →</span>
            </button>
          </div>
        </div>

        {/* SOURCE 4: LIVE WEATHER & TRANSPORT TELEMETRY */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
          <div className="flex justify-between items-start gap-2 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-orange-100 text-orange-700 flex items-center justify-center">
                <CloudSun className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-heading font-bold text-base text-slate-900">
                  Live Weather & GTFS-RT Telemetry
                </h3>
                <span className="text-xs text-slate-500">
                  External Regional API Feeds
                </span>
              </div>
            </div>
            <span
              className={`px-2.5 py-0.5 rounded text-xs font-bold border ${
                liveStatus?.weather_feed.is_available
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-red-50 text-red-800 border-red-200'
              }`}
            >
              {liveStatus?.weather_feed.status || 'UNAVAILABLE'}
            </span>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            Direct integration with regional meteorological services or GPS transit tracking systems. Honestly reports connection status without inventing mock live feeds.
          </p>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-2 text-slate-700">
            <div className="flex justify-between items-center">
              <span>Weather Sensor Feed:</span>
              <span className="font-mono font-bold text-red-700">
                {liveStatus?.weather_feed.status || 'OFFLINE'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span>Transit Telemetry (GPS):</span>
              <span className="font-mono font-bold text-red-700">
                {liveStatus?.bus_schedule_feed.status || 'OFFLINE'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 leading-snug pt-1 border-t border-slate-200">
              {liveStatus?.weather_feed.message || 'Live external weather API unconfigured. System honestly operates on operator scenario parameters without faking live sensor feeds.'}
            </p>
          </div>

          <div className="text-[11px] text-slate-500">
            ✓ Operator weather changes are clearly distinguished from automated satellite telemetry.
          </div>
        </div>

      </div>

      {/* 4. DATA PIPELINE ARCHITECTURE CARD */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-3">
        <h3 className="font-heading font-bold text-base text-slate-900">
          How Data Flows Through CrowdRoute AI
        </h3>
        <p className="text-xs text-slate-600 leading-relaxed max-w-4xl">
          1. <strong>Input Layer:</strong> Transit officers configure festival parameters or upload historical ticketing counts.<br />
          2. <strong>Prediction Engine:</strong> Calculates 15-minute passenger arrival distributions per bus stop, adjusting for weather surge concentration.<br />
          3. <strong>Optimization Engine:</strong> Analyzes idle buses at donor stands and computes safe relocations strictly respecting minimum service reserves and total fleet conservation.<br />
          4. <strong>Discrete Simulation:</strong> Evaluates before-and-after queuing and boarding throughput with standardized 15-minute interval turnaround capacity.
        </p>
      </div>

    </div>
  );
};

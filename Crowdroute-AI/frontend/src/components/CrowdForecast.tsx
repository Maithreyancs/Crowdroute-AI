import React, { useState } from 'react';
import { ArrowRight, BarChart3, Users, Zap, ShieldAlert, ChevronDown, ChevronUp } from 'lucide-react';
import { ForecastResponse, RiskLevel, Stop } from '../types/api';
import { DemandChart } from './DemandChart';
import { formatTo12Hour } from '../utils/timeFormat';

interface CrowdForecastProps {
  forecast: ForecastResponse | null;
  stops?: Stop[];
  onViewDetailedTable: () => void;
}

export const CrowdForecast: React.FC<CrowdForecastProps> = ({
  forecast,
  stops = [],
  onViewDetailedTable,
}) => {
  const [showChart, setShowChart] = useState(true);
  const [showDetails, setShowDetails] = useState(false);

  if (!forecast) {
    return (
      <section id="crowd-forecast" className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="bg-white rounded-xl p-8 border border-slate-200 text-center text-slate-500">
          Loading crowd predictions...
        </div>
      </section>
    );
  }

  const getRiskBadge = (risk: RiskLevel) => {
    switch (risk) {
      case 'CRITICAL':
        return {
          label: 'Very High Crowd',
          classes: 'bg-red-50 text-red-800 border-red-200 font-bold',
        };
      case 'HIGH':
        return {
          label: 'High Crowd',
          classes: 'bg-orange-50 text-orange-800 border-orange-200 font-bold',
        };
      case 'MODERATE':
        return {
          label: 'Moderate Crowd',
          classes: 'bg-amber-50 text-amber-800 border-amber-200 font-semibold',
        };
      case 'LOW':
      default:
        return {
          label: 'Low Crowd',
          classes: 'bg-emerald-50 text-emerald-800 border-emerald-200 font-semibold',
        };
    }
  };

  const stopList = Object.values(forecast.stop_summaries || {});

  return (
    <section id="crowd-forecast" className="max-w-7xl mx-auto px-4 sm:px-6 py-12 space-y-8">
      
      {/* SECTION TITLE BAR */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-4 border-b-2 border-slate-200">
        <div className="space-y-1">
          <div className="text-xs font-bold text-sky-700 tracking-wider uppercase">
            CROWD & PASSENGER MONITORING
          </div>
          <h2 className="font-heading text-3xl font-bold text-slate-900 tracking-tight">
            Crowd Prediction
          </h2>
          <p className="text-sm text-slate-600 max-w-2xl">
            Anticipated passenger arrivals, busiest times, and available bus carrying capacity across active terminals.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="px-2.5 py-1 rounded bg-slate-100 text-slate-700 border border-slate-300 text-xs font-semibold">
            {forecast.method_used}
          </span>
          <span className="px-2.5 py-1 rounded bg-amber-50 text-amber-800 border border-amber-200 text-xs font-bold uppercase tracking-wider">
            {forecast.confidence_level === 'PRELIMINARY_BASELINE' ? 'Preliminary Estimate' : forecast.confidence_level}
          </span>
          <button
            onClick={() => setShowChart(!showChart)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-xs font-semibold shadow-sm"
          >
            <BarChart3 className="w-3.5 h-3.5 text-sky-600" />
            <span>{showChart ? 'Hide Crowd Graph' : 'Show Crowd Graph'}</span>
          </button>
          <button
            onClick={onViewDetailedTable}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold shadow-sm"
          >
            <span>Full 15-Minute Timeline</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* STOP SUMMARY PREVIEW CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {stopList.map((stop) => {
          const isCritical = stop.overall_risk === 'CRITICAL';
          const hasZeroBuses = stop.baseline_scheduled_capacity === 0;
          const badge = getRiskBadge(stop.overall_risk);
          const stopObj = stops.find((s) => s.stop_id === stop.stop_id);
          const stopTitle = stopObj ? stopObj.name : stop.stop_id;

          return (
            <div
              key={stop.stop_id}
              className={`bg-white border rounded-xl p-5 shadow-sm space-y-4 transition-all hover:shadow-md ${
                isCritical
                  ? 'border-l-4 border-l-red-600 border-slate-200'
                  : 'border-slate-200'
              }`}
            >
              {/* TOP HEADER */}
              <div className="flex justify-between items-start gap-2">
                <div>
                  <h3 className="font-heading font-bold text-base text-slate-900 leading-snug">
                    {stopTitle}
                  </h3>
                  <div className="text-xs text-slate-500 font-mono mt-0.5">
                    Code: {stop.stop_id}
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded text-[11px] border whitespace-nowrap ${badge.classes}`}>
                  {badge.label}
                </span>
              </div>

              {/* ZERO CAPACITY ALERT CALLOUT FOR STOPS WITH NO ASSIGNED FLEET (e.g. East Temple Gate) */}
              {hasZeroBuses && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 text-xs text-red-800 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-red-900">
                    <ShieldAlert className="w-4 h-4 text-red-600 flex-shrink-0" />
                    <span>No buses assigned</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-red-700">
                    This stop currently has no assigned bus capacity and requires operational attention. Existing buses must be relocated here.
                  </p>
                </div>
              )}

              {/* METRIC ROWS */}
              <div className="space-y-2 text-xs border-t border-slate-100 pt-3">
                <div className="flex justify-between items-center text-slate-600">
                  <span className="flex items-center gap-1">
                    <span>Busiest Time:</span>
                  </span>
                  <span className="font-mono font-bold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                    {formatTo12Hour(stop.peak_interval)}
                  </span>
                </div>

                <div className="flex justify-between items-center text-slate-600">
                  <span>Expected Passengers:</span>
                  <span className="font-mono font-bold text-slate-900">
                    {stop.peak_demand.toLocaleString()} passengers
                  </span>
                </div>

                <div className="flex justify-between items-center text-slate-600">
                  <span>Bus Capacity:</span>
                  {hasZeroBuses ? (
                    <span className="font-mono font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-200">
                      No buses assigned (0 pax)
                    </span>
                  ) : (
                    <span className="font-mono font-semibold text-emerald-700">
                      {stop.baseline_scheduled_capacity.toLocaleString()} pax/window
                    </span>
                  )}
                </div>
              </div>

              {/* TOTAL EXPECTED DEMAND & STATUS */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                <div className="flex items-center gap-1 text-slate-700 font-medium">
                  <Users className="w-3.5 h-3.5 text-slate-400" />
                  <span>Total Crowd: <strong>{stop.total_demand.toLocaleString()}</strong></span>
                </div>
                {hasZeroBuses ? (
                  <span className="inline-flex items-center gap-1 text-red-700 font-semibold">
                    <ShieldAlert className="w-3.5 h-3.5 text-red-600" />
                    Needs Attention
                  </span>
                ) : isCritical ? (
                  <span className="inline-flex items-center gap-1 text-red-700 font-semibold">
                    <ShieldAlert className="w-3.5 h-3.5 text-red-600" />
                    Bottleneck
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                    <Zap className="w-3.5 h-3.5 text-emerald-600" />
                    Sufficient
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* DEMAND CURVE CHART */}
      {showChart && <DemandChart intervals={forecast.intervals} stops={stops} />}

      {/* EXPANDABLE "MORE DETAILS" OPERATIONAL EXPLAINER */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-600 space-y-2">
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="w-full flex items-center justify-between text-slate-800 font-semibold hover:text-sky-700"
        >
          <span>More details: Prediction Methodology & Boarding Capacity Assumption</span>
          {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showDetails && (
          <div className="pt-2 border-t border-slate-200 text-slate-600 space-y-1.5 leading-relaxed animate-fadeIn">
            <p>
              • <strong>Confidence Indicator:</strong> {forecast.confidence_indicator}
            </p>
            <p>
              • <strong>Standard Boarding Assumption:</strong> Bus Capacity represents standard boarding throughput of{' '}
              <code className="font-mono bg-slate-200 px-1 py-0.5 rounded text-slate-800">
                floor(capacity / 2)
              </code>{' '}
              passengers per bus for each 15-minute interval cycle (reflecting turnaround, stop clearance, and boarding safety).
            </p>
            <p>
              • <strong>East Temple Gate Assignment:</strong> If a stop has zero scheduled buses, it is recorded as 0 capacity and flagged for relocation rather than assuming phantom vehicles.
            </p>
          </div>
        )}
      </div>

    </section>
  );
};


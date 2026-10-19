import React from 'react';
import { SimulateResponse } from '../types/api';
import { TrendingUp, TrendingDown, Users, CheckCircle } from 'lucide-react';

interface SimulationComparisonProps {
  simulation: SimulateResponse | null;
}

export const SimulationComparison: React.FC<SimulationComparisonProps> = ({ simulation }) => {
  const [showExplainer, setShowExplainer] = React.useState(false);

  if (!simulation) {
    return <div className="p-8 text-center text-slate-500">Loading simulation results...</div>;
  }

  const { baseline_simulation, proposed_simulation, net_comparison, fleet_audit } = simulation;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-6">
      
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-4 border-b border-slate-200">
        <div>
          <h3 className="font-heading font-bold text-xl text-slate-900">
            Before and After Bus Changes
          </h3>
          <p className="text-xs text-slate-500">
            Discrete interval passenger arrival and boarding simulation under identical crowd dynamics.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowExplainer(!showExplainer)}
            className="text-xs text-sky-700 hover:text-sky-900 underline font-semibold"
          >
            What does this mean?
          </button>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold font-mono">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
            <span>All {fleet_audit.initial_fleet_count} Buses Accounted For</span>
          </div>
        </div>
      </div>

      {showExplainer && (
        <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 text-xs text-sky-900 space-y-1.5 animate-fadeIn">
          <strong className="block text-sm font-bold text-sky-950">
            How to read this simulation:
          </strong>
          <p>
            <strong>Before Bus Changes:</strong> Demonstrates crowds left waiting if buses stick strictly to regular non-festival routes.
          </p>
          <p>
            <strong>After Bus Changes:</strong> Shows the impact of shifting available buses to high-demand temple stops during peak dismissal.
          </p>
          <p>
            <strong>Passengers Still Waiting:</strong> The count of people unable to board in that interval; lower values indicate quicker boarding and safe crowds.
          </p>
        </div>
      )}

      {/* 4 KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* KPI 1 */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-1">
          <span className="block text-xs font-semibold text-slate-500 uppercase">
            Additional Passengers Boarded
          </span>
          <span className="text-2xl font-bold text-emerald-700 font-mono">
            +{net_comparison.system_additional_passengers_boarded}
          </span>
          <span className="block text-[11px] text-slate-500">
            Across 2-hour festival egress
          </span>
        </div>

        {/* KPI 2 */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-1">
          <span className="block text-xs font-semibold text-slate-500 uppercase">
            Reduction in People Still Waiting
          </span>
          <span className="text-2xl font-bold text-emerald-700 font-mono">
            -{net_comparison.system_unmet_demand_reduction}
          </span>
          <span className="block text-[11px] text-slate-500">
            Residual queue cleared faster
          </span>
        </div>

        {/* KPI 3 */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-1">
          <span className="block text-xs font-semibold text-slate-500 uppercase">
            Main Hub Peak Queue Relief
          </span>
          <span className="text-2xl font-bold text-emerald-700 font-mono">
            -{net_comparison.main_hub_peak_queue_reduction}
          </span>
          <span className="block text-[11px] text-slate-500">
            Bottleneck reduced at BS_MAIN
          </span>
        </div>

        {/* KPI 4 */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-1">
          <span className="block text-xs font-semibold text-slate-500 uppercase">
            Impact on Stop Losing a Bus
          </span>
          <span className="text-2xl font-bold text-amber-700 font-mono">
            +{net_comparison.source_stop_peak_queue_increase}
          </span>
          <span className="block text-[11px] text-slate-500">
            Preserved within safety minimums
          </span>
        </div>

      </div>

      {/* SIDE BY SIDE METRICS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        
        {/* BASELINE */}
        <div className="border border-slate-200 rounded-lg p-4 bg-white space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-200 text-sm font-bold text-slate-800">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-400"></span>
            <span>Before Bus Changes (Regular Schedule)</span>
          </div>

          <div className="space-y-2 text-xs font-mono">
            <div className="flex justify-between py-1 border-b border-slate-50">
              <span className="font-sans text-slate-600">Total Arrived:</span>
              <span className="font-bold text-slate-900">{baseline_simulation.total_passengers_arrived.toLocaleString()}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-50">
              <span className="font-sans text-slate-600">Total Boarded:</span>
              <span className="font-bold text-slate-900">{baseline_simulation.total_passengers_boarded.toLocaleString()}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-50">
              <span className="font-sans text-slate-600">People Still Waiting:</span>
              <span className="font-bold text-rose-700">{baseline_simulation.system_unmet_demand.toLocaleString()}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-50">
              <span className="font-sans text-slate-600">System Peak Queue:</span>
              <span className="font-bold text-slate-900">{baseline_simulation.system_peak_queue.toLocaleString()}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="font-sans text-slate-600">Bus Utilization Rate:</span>
              <span className="font-bold text-slate-900">{(baseline_simulation.bus_utilization_rate * 100).toFixed(1)}%</span>
            </div>
          </div>
        </div>

        {/* PROPOSED */}
        <div className="border border-slate-200 rounded-lg p-4 bg-white space-y-3 border-l-4 border-l-emerald-600">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-200 text-sm font-bold text-slate-800">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
            <span>After Bus Changes (Optimized Deployment)</span>
          </div>

          <div className="space-y-2 text-xs font-mono">
            <div className="flex justify-between py-1 border-b border-slate-50">
              <span className="font-sans text-slate-600">Total Arrived:</span>
              <span className="font-bold text-slate-900">{proposed_simulation.total_passengers_arrived.toLocaleString()}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-50">
              <span className="font-sans text-slate-600">Total Boarded:</span>
              <span className="font-bold text-emerald-700">+{proposed_simulation.total_passengers_boarded.toLocaleString()}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-50">
              <span className="font-sans text-slate-600">People Still Waiting:</span>
              <span className="font-bold text-emerald-700">{proposed_simulation.system_unmet_demand.toLocaleString()}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-50">
              <span className="font-sans text-slate-600">System Peak Queue:</span>
              <span className="font-bold text-slate-900">{proposed_simulation.system_peak_queue.toLocaleString()}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="font-sans text-slate-600">Bus Utilization Rate:</span>
              <span className="font-bold text-slate-900">{(proposed_simulation.bus_utilization_rate * 100).toFixed(1)}%</span>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
};

import React from 'react';
import { ArrowRight, ShieldCheck, Bus, Clock, CheckCircle2, AlertCircle, HelpCircle } from 'lucide-react';
import { AllocateResponse } from '../types/api';
import { formatTo12Hour } from '../utils/timeFormat';

interface BusAllocationProps {
  allocation: AllocateResponse | null;
  onViewSimulation: () => void;
}

export const BusAllocation: React.FC<BusAllocationProps> = ({
  allocation,
  onViewSimulation,
}) => {
  if (!allocation) {
    return (
      <section id="bus-allocation" className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="bg-white rounded-xl p-8 border border-slate-200 text-center text-slate-500">
          Loading suggested bus changes...
        </div>
      </section>
    );
  }

  const { recommended_moves, status, summary, fleet_audit } = allocation;

  return (
    <section id="bus-allocation" className="max-w-7xl mx-auto px-4 sm:px-6 py-12 space-y-8">
      
      {/* SECTION TITLE BAR */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-4 border-b-2 border-slate-200">
        <div className="space-y-1">
          <div className="text-xs font-bold text-sky-700 tracking-wider uppercase">
            BUS REDISTRIBUTION PLANNING
          </div>
          <h2 className="font-heading text-3xl font-bold text-slate-900 tracking-tight">
            Suggested Bus Changes
          </h2>
          <p className="text-sm text-slate-600 max-w-2xl">
            Strategic relocation of existing buses to relieve heavy crowds at the busiest stand while strictly protecting minimum bus services at the source stop.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold shadow-sm">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>
              All {fleet_audit.final_fleet_count} Buses Accounted For (Fixed Fleet)
            </span>
          </div>

          <button
            onClick={onViewSimulation}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold shadow-sm"
          >
            <span>Before and After Bus Changes</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* RECOMMENDED MOVES CONTAINER */}
      {status === 'NO_SAFE_MOVE' || recommended_moves.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center space-y-2">
          <div className="inline-flex items-center gap-2 text-amber-800 font-bold text-base">
            <AlertCircle className="w-5 h-5 text-amber-600" />
            <span>No Safe Bus Moves Feasible Under Current Constraints</span>
          </div>
          <p className="text-sm text-amber-700 max-w-xl mx-auto">
            {summary || 'All evaluated bus moves either left the source stop with too few buses, or arrived after peak crowds passed.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {recommended_moves.map((move, idx) => (
            <div
              key={`${move.bus_id}-${idx}`}
              className="bg-white border border-slate-200 border-t-4 border-t-orange-600 rounded-xl p-5 shadow-sm space-y-4 hover:shadow-md transition-shadow"
            >
              {/* TOP HEADER */}
              <div className="flex justify-between items-center">
                <div className="inline-flex items-center gap-2">
                  <span className="font-mono font-bold text-xs bg-slate-100 text-slate-800 border border-slate-300 px-2.5 py-1 rounded">
                    Bus ID: {move.bus_id}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    APPROVED MOVE
                  </span>
                </div>
                <div className="text-xs text-slate-500 font-mono">
                  Busiest Time: {formatTo12Hour(move.target_peak_interval)}
                </div>
              </div>

              {/* ROUTE FLOW */}
              <div className="flex items-center gap-3 text-lg font-bold text-slate-900 py-1">
                <span className="font-mono text-slate-700">{move.source_stop_id}</span>
                <span className="text-orange-600 font-normal">➔</span>
                <span className="font-mono text-sky-700">{move.destination_stop_id}</span>
              </div>

              {/* TIMINGS */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 flex justify-between items-center text-xs text-slate-600 font-mono">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>Departs: <strong className="text-slate-900">{formatTo12Hour(move.departure_time)}</strong></span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span>Arrives: <strong className="text-slate-900">{formatTo12Hour(move.estimated_arrival_time)}</strong></span>
                </div>
              </div>

              {/* BENEFIT VS TRADE-OFF WITH SOURCE SERVICE AND MINIMUM GUARANTEE */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2 text-xs">
                <div className="text-emerald-700 font-semibold flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                    <span>Benefit at Destination ({move.destination_stop_id}):</span>
                  </span>
                  <span className="font-mono font-bold text-emerald-800">+{move.estimated_destination_benefit} extra passenger capacity</span>
                </div>
                
                <div className="text-slate-700 space-y-1 pt-1 border-t border-slate-200/70">
                  <div className="flex justify-between items-center">
                    <span className="flex items-center gap-1.5 font-semibold text-slate-800">
                      <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                      <span>Service Reduced at Source Stop ({move.source_stop_id}):</span>
                    </span>
                    <span className="font-mono font-bold text-slate-900">{move.source_service_after} buses remaining</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px] text-slate-600">
                    <span>Source Minimum Service:</span>
                    <span className="inline-flex items-center gap-1 font-bold text-emerald-700">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      <span>Satisfied ({move.source_service_after} buses ≥ safety minimum)</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* WHY IS THIS RECOMMENDED EXPANDABLE DETAILS */}
              <details className="text-xs text-slate-500 pt-1">
                <summary className="font-semibold text-slate-700 cursor-pointer hover:text-sky-700">
                  Why is this recommended? (Operational safety checks)
                </summary>
                <div className="space-y-1 text-[11px] mt-2 pt-2 border-t border-slate-100">
                  <p className="text-slate-600 italic">
                    "{move.destination_need_reason}"
                  </p>
                  <p className="text-slate-600 italic">
                    "{move.source_service_impact_description}"
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 pt-1">
                    {move.constraints_passed.map((c, i) => (
                      <div key={i} className="flex items-center gap-1 text-slate-600">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600 flex-shrink-0" />
                        <span className="truncate">{c.split(':')[0]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </details>

            </div>
          ))}
        </div>
      )}

    </section>
  );
};

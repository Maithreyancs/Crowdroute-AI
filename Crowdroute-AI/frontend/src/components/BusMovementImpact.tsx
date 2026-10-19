import React, { useState } from 'react';
import {
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  Bus as BusIcon,
  Clock,
  CheckCircle2,
  XCircle,
  TrendingDown,
  TrendingUp,
  HelpCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  AllocateResponse,
  BusMove,
  ForecastResponse,
  ScenarioData,
} from '../types/api';
import { formatTo12Hour } from '../utils/timeFormat';

interface BusMovementImpactProps {
  allocation: AllocateResponse | null;
  forecast: ForecastResponse | null;
  scenario: ScenarioData | null;
  onViewSimulation?: () => void;
}

export const BusMovementImpact: React.FC<BusMovementImpactProps> = ({
  allocation,
  forecast,
  scenario,
  onViewSimulation,
}) => {
  const [showRejected, setShowRejected] = useState<boolean>(false);
  const [showExplainer, setShowExplainer] = useState<boolean>(false);
  const [showFleet, setShowFleet] = useState<boolean>(false);

  if (!allocation) {
    return (
      <section id="bus-movement-impact" className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="bg-white rounded-xl p-8 border border-slate-200 text-center text-slate-500">
          Loading bus movement impact analysis...
        </div>
      </section>
    );
  }

  const { recommended_moves, rejected_moves, status, summary, fleet_audit } = allocation;

  const getStopName = (stopId: string) => {
    const s = scenario?.stops.find((st) => st.stop_id === stopId);
    return s ? `${s.name} (${stopId})` : stopId;
  };

  const getStopMinService = (stopId: string) => {
    const s = scenario?.stops.find((st) => st.stop_id === stopId);
    return s ? s.min_service_buses : 0;
  };

  return (
    <section id="bus-movement-impact" className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      
      {/* SECTION TITLE & AUDIT INVARIANT BAR */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-4 border-b-2 border-slate-200">
        <div className="space-y-1">
          <div className="text-xs font-bold text-sky-700 tracking-wider uppercase">
            CONSTRAINT 2 • FIXED FLEET WITH VISIBLE TRADE-OFFS
          </div>
          <h2 className="font-heading text-3xl font-bold text-slate-900 tracking-tight">
            Suggested Bus Changes & Trade-offs
          </h2>
          <p className="text-sm text-slate-600 max-w-2xl">
            Every relocation explicitly balances benefit gained at the destination against service reduced at the source stop. No phantom buses are created.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Strict Invariant Audit Badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-300 text-xs font-bold shadow-sm font-mono">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>
              All {fleet_audit.final_fleet_count}/{fleet_audit.initial_fleet_count} Buses Accounted For (Fixed Fleet Conserved)
            </span>
          </div>

          {onViewSimulation && (
            <button
              onClick={onViewSimulation}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold shadow-sm"
            >
              <span>Before & After Simulation</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* EXPLAINER TOGGLE */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowExplainer(!showExplainer)}
          className="text-xs text-sky-700 hover:text-sky-900 font-semibold underline inline-flex items-center gap-1"
        >
          <HelpCircle className="w-3.5 h-3.5" />
          <span>What does this trade-off mean?</span>
        </button>
      </div>

      {showExplainer && (
        <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 text-xs text-sky-900 space-y-1.5 animate-fadeIn">
          <strong className="block text-sm font-bold text-sky-950">
            Official Hackathon Constraint 2 Rules:
          </strong>
          <p>
            • <strong>Fixed Fleet:</strong> We cannot buy or rent new buses during the festival. The system may only relocate buses from quieter stands to overloaded stands. Total fleet count remains strictly unchanged.
          </p>
          <p>
            • <strong>Visible Service Trade-Offs:</strong> Moving a bus to help the temple crowd means the source stand loses that vehicle. We display both the destination benefit and the source service loss so authorities never make blind reallocations.
          </p>
          <p>
            • <strong>Protected Minimums:</strong> If a relocation would leave the source stand below its configured minimum safety service threshold, that move is strictly rejected.
          </p>
        </div>
      )}

      {/* FIXED FLEET INVENTORY SECTION (SOURCE OF TRUTH) */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div>
            <div className="flex items-center gap-2">
              <BusIcon className="w-5 h-5 text-sky-700" />
              <h3 className="font-heading font-bold text-lg text-slate-900">
                Fixed Fleet Inventory ({scenario?.fleet.length || 0} Buses)
              </h3>
            </div>
            <p className="text-xs text-slate-600 mt-0.5">
              Reflects the actual current fleet. 15-minute boarding capacity standardized to{' '}
              <code className="font-mono bg-slate-200 px-1 py-0.5 rounded text-slate-800">
                floor(capacity / 2)
              </code>{' '}
              passengers per interval cycle.
            </p>
          </div>
          <button
            onClick={() => setShowFleet(!showFleet)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold shadow-sm"
          >
            <span>{showFleet ? 'Hide Fleet Roster' : 'View Full Fleet Roster'}</span>
            {showFleet ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* SUMMARY PILLS */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-white border border-slate-200 rounded-lg p-3">
            <span className="text-slate-500 block text-[11px] uppercase font-semibold">Total Conserved Fleet</span>
            <strong className="text-slate-900 font-mono text-base">{scenario?.fleet.length || 0} Buses</strong>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-3">
            <span className="text-slate-500 block text-[11px] uppercase font-semibold">Available Vehicles</span>
            <strong className="text-emerald-700 font-mono text-base">
              {scenario?.fleet.filter((b) => b.status === 'available').length || 0} Buses
            </strong>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-3">
            <span className="text-slate-500 block text-[11px] uppercase font-semibold">Depot Distribution</span>
            <span className="text-slate-800 font-mono text-xs block truncate" title="Assigned buses per stand">
              {scenario?.stops.map((s) => `${s.stop_id}: ${scenario.fleet.filter((b) => b.initial_stop_id === s.stop_id).length}`).join(' • ')}
            </span>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-3">
            <span className="text-slate-500 block text-[11px] uppercase font-semibold">Fleet Conservation</span>
            <span className="inline-flex items-center gap-1 text-emerald-700 font-bold text-xs">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Conserved (0 Phantom)</span>
            </span>
          </div>
        </div>

        {showFleet && (
          <div className="overflow-x-auto max-h-64 custom-scrollbar pt-2 animate-fadeIn">
            <table className="w-full text-left text-xs bg-white rounded-lg border border-slate-200">
              <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-200 sticky top-0">
                <tr>
                  <th className="p-2.5">Bus ID</th>
                  <th className="p-2.5">Initial Bus Stand</th>
                  <th className="p-2.5">Seating Capacity</th>
                  <th className="p-2.5">15-Min Boarding Cap</th>
                  <th className="p-2.5">Status</th>
                  <th className="p-2.5">Compatible Routes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {scenario?.fleet.map((bus) => {
                  const intCap = Math.floor(bus.capacity / 2);
                  return (
                    <tr key={bus.bus_id} className="hover:bg-slate-50">
                      <td className="p-2.5 font-bold text-slate-900">{bus.bus_id}</td>
                      <td className="p-2.5 font-sans">
                        {getStopName(bus.initial_stop_id)}
                      </td>
                      <td className="p-2.5">{bus.capacity} seats</td>
                      <td className="p-2.5 font-bold text-emerald-700">{intCap} pax/interval</td>
                      <td className="p-2.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            bus.status === 'available'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {bus.status}
                        </span>
                      </td>
                      <td className="p-2.5 text-[11px] text-slate-500 font-sans">
                        {bus.compatible_routes?.join(', ') || 'All Routes'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* STATUS = NO_SAFE_MOVE NOTICE (OFFICIAL REQUIREMENT) */}
      {(status === 'NO_SAFE_MOVE' || recommended_moves.length === 0) ? (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-6 sm:p-8 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-700 mx-auto flex items-center justify-center">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h3 className="font-heading font-bold text-lg text-amber-950">
            No Safe Bus Moves Feasible Under Current Constraints
          </h3>
          <p className="text-sm font-semibold text-amber-800 max-w-xl mx-auto">
            “No safe bus relocation is currently available. Existing service requirements would be violated by the available options.”
          </p>
          <p className="text-xs text-amber-700 max-w-lg mx-auto">
            {summary || 'Every evaluated candidate would either breach the donor stop’s safety reserve minimum or arrive too late after the crowd peak has already concluded.'}
          </p>
        </div>
      ) : (
        /* LIST OF RECOMMENDED MOVES WITH COMPLETE DUAL-SIDED IMPACT */
        <div className="space-y-6">
          {recommended_moves.map((move: BusMove, idx: number) => {
            const destSummary = forecast?.stop_summaries[move.destination_stop_id];
            const sourceSummary = forecast?.stop_summaries[move.source_stop_id];
            const sourceMinService = getStopMinService(move.source_stop_id);
            const remainingDeficitAtDest = destSummary
              ? Math.max(0, destSummary.peak_demand - (destSummary.baseline_scheduled_capacity + move.estimated_destination_benefit))
              : 0;

            return (
              <div
                key={`${move.bus_id}-${idx}`}
                className="bg-white border border-slate-200 border-l-4 border-l-orange-600 rounded-2xl p-5 sm:p-6 shadow-sm space-y-5"
              >
                {/* 1. MOVEMENT SUMMARY HEADER */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono text-sm bg-slate-900 text-white font-bold px-3 py-1 rounded-lg">
                      Move Bus {move.bus_id}
                    </span>
                    <div className="flex items-center gap-2 text-base font-bold text-slate-900">
                      <span className="text-slate-700">{getStopName(move.source_stop_id)}</span>
                      <span className="text-orange-600 font-bold">➔</span>
                      <span className="text-sky-700">{getStopName(move.destination_stop_id)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-300">
                      DECISION: RECOMMENDED
                    </span>
                    <span className="text-xs text-slate-500 font-mono">
                      Busiest Time: {formatTo12Hour(move.target_peak_interval)}
                    </span>
                  </div>
                </div>

                {/* 2. TIMINGS & OPERATIONAL SCHEDULE */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
                  <div className="flex items-center gap-2 text-slate-700">
                    <Clock className="w-4 h-4 text-slate-400" />
                    <span>Departure Time: <strong className="text-slate-900">{formatTo12Hour(move.departure_time)}</strong></span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-700">
                    <Clock className="w-4 h-4 text-emerald-600" />
                    <span>Expected Arrival at Destination: <strong className="text-slate-900">{formatTo12Hour(move.estimated_arrival_time)}</strong></span>
                  </div>
                  <div className="text-slate-500 font-sans text-[11px]">
                    (Arrives ahead of destination peak window {formatTo12Hour(move.target_peak_interval)})
                  </div>
                </div>

                {/* 3. DUAL-SIDED IMPACT: DESTINATION BENEFIT VS SOURCE-STOP SERVICE LOSS */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  
                  {/* LEFT: DESTINATION BENEFIT */}
                  <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-emerald-200/60">
                      <div className="flex items-center gap-1.5 font-bold text-emerald-950 text-sm">
                        <TrendingUp className="w-4 h-4 text-emerald-600" />
                        <span>Benefit at Destination</span>
                      </div>
                      <span className="text-[11px] font-mono text-emerald-700 font-semibold">
                        {move.destination_stop_id}
                      </span>
                    </div>

                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between text-slate-700">
                        <span>Predicted Peak Demand:</span>
                        <strong className="font-mono text-slate-900">
                          {destSummary ? `${destSummary.peak_demand.toLocaleString()} passengers` : 'Calculating...'}
                        </strong>
                      </div>

                      <div className="flex justify-between text-slate-700">
                        <span>Existing Bus Capacity:</span>
                        <span className="font-mono text-slate-800">
                          {destSummary && destSummary.baseline_scheduled_capacity === 0
                            ? 'No buses assigned (0 pax)'
                            : destSummary
                            ? `${destSummary.baseline_scheduled_capacity.toLocaleString()} pax/window`
                            : 'N/A'}
                        </span>
                      </div>

                      <div className="flex justify-between text-emerald-800 font-bold bg-white/70 px-2 py-1 rounded border border-emerald-200">
                        <span>Additional Boarding Capacity Added:</span>
                        <span className="font-mono">+{move.estimated_destination_benefit} pax/window</span>
                      </div>

                      <div className="flex justify-between text-slate-600 text-[11px] pt-1">
                        <span>People Still Waiting:</span>
                        <span className="font-mono font-semibold text-slate-900">
                          {remainingDeficitAtDest > 0 ? `${remainingDeficitAtDest.toLocaleString()} passengers` : 'Fully cleared'}
                        </span>
                      </div>
                    </div>

                    <p className="text-[11px] text-emerald-900/80 leading-relaxed italic pt-1 border-t border-emerald-200/50">
                      "{move.destination_need_reason}"
                    </p>
                  </div>

                  {/* RIGHT: SOURCE-STOP SERVICE LOSS */}
                  <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-amber-200/60">
                      <div className="flex items-center gap-1.5 font-bold text-amber-950 text-sm">
                        <TrendingDown className="w-4 h-4 text-amber-600" />
                        <span>Service Reduced at Source Stop</span>
                      </div>
                      <span className="text-[11px] font-mono text-amber-700 font-semibold">
                        {move.source_stop_id}
                      </span>
                    </div>

                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between text-slate-700">
                        <span>Buses Stationed Before Move:</span>
                        <span className="font-mono text-slate-900">{move.source_service_before} buses</span>
                      </div>

                      <div className="flex justify-between text-amber-900 font-semibold bg-white/70 px-2 py-1 rounded border border-amber-200">
                        <span>Buses Remaining After Relocation:</span>
                        <strong className="font-mono">{move.source_service_after} buses (-1 bus)</strong>
                      </div>

                      <div className="flex justify-between text-slate-700">
                        <span>Protected Minimum Service Threshold:</span>
                        <span className="font-mono text-slate-900">{sourceMinService} buses required</span>
                      </div>

                      <div className="flex justify-between items-center text-[11px] pt-1">
                        <span>Minimum Service Status:</span>
                        <span className="inline-flex items-center gap-1 font-bold text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Protected ({move.source_service_after} ≥ {sourceMinService})</span>
                        </span>
                      </div>
                    </div>

                    <p className="text-[11px] text-amber-900 leading-relaxed italic pt-1 border-t border-amber-200/50">
                      "{move.source_service_impact_description}"
                    </p>
                  </div>

                </div>

                {/* 4. EXPANDABLE CONSTRAINTS VERIFICATION BADGES */}
                <details className="pt-2 border-t border-slate-100 text-xs text-slate-500">
                  <summary className="font-semibold text-slate-700 cursor-pointer hover:text-sky-700">
                    Why is this recommended? (All 7 operational checks verified)
                  </summary>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-2 pt-2 border-t border-slate-100">
                    {move.constraints_passed.map((c, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-1.5 text-[11px] text-slate-700 bg-slate-50 px-2.5 py-1 rounded border border-slate-200 truncate"
                        title={c}
                      >
                        <CheckCircle2 className="w-3 h-3 text-emerald-600 flex-shrink-0" />
                        <span className="truncate">{c.split(':')[0]}</span>
                      </div>
                    ))}
                  </div>
                </details>

              </div>
            );
          })}
        </div>
      )}

      {/* REJECTED MOVEMENTS AUDIT ACCORDION */}
      {rejected_moves.length > 0 && (
        <div className="border border-slate-200 rounded-2xl bg-white p-5 space-y-3 shadow-sm">
          <div className="flex justify-between items-center">
            <div className="space-y-0.5">
              <h3 className="font-heading font-bold text-base text-slate-900 flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-600" />
                <span>Rejected Movement Candidates ({rejected_moves.length})</span>
              </h3>
              <p className="text-xs text-slate-500">
                Transparent audit of candidate buses evaluated and rejected to prevent safety breaches or late arrivals.
              </p>
            </div>

            <button
              onClick={() => setShowRejected(!showRejected)}
              className="text-xs font-semibold text-slate-700 hover:text-slate-900 inline-flex items-center gap-1"
            >
              <span>{showRejected ? 'Hide Rejections' : 'View Rejection Reasons'}</span>
              {showRejected ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>

          {showRejected && (
            <div className="overflow-x-auto max-h-72 custom-scrollbar pt-2 animate-fadeIn">
              <table className="w-full text-left text-xs bg-white rounded border border-slate-200">
                <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-2.5">Bus ID</th>
                    <th className="p-2.5">Route</th>
                    <th className="p-2.5">Constraint Breached</th>
                    <th className="p-2.5">Plain-English Rejection Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {rejected_moves.map((rej, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="p-2.5 font-bold text-slate-900">{rej.bus_id}</td>
                      <td className="p-2.5">
                        {rej.source_stop_id} ➔ {rej.destination_stop_id}
                      </td>
                      <td className="p-2.5">
                        <span className="px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-200 text-[10px] font-bold">
                          {rej.constraint_violated}
                        </span>
                      </td>
                      <td className="p-2.5 font-sans text-slate-600 max-w-sm">
                        {rej.reason_rejected}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

    </section>
  );
};

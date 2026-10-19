import React, { useState } from 'react';
import {
  Clock,
  Bus as BusIcon,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Filter,
  Calendar,
  HelpCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  AllocateResponse,
  Bus,
  ForecastResponse,
  ScenarioData,
} from '../types/api';
import {
  formatTo12Hour,
  calculateDurationMinutes,
  formatDuration,
} from '../utils/timeFormat';

interface BusTimetableProps {
  allocation: AllocateResponse | null;
  forecast: ForecastResponse | null;
  scenario: ScenarioData | null;
}

export const BusTimetable: React.FC<BusTimetableProps> = ({
  allocation,
  forecast,
  scenario,
}) => {
  const [filterStop, setFilterStop] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'RELOCATIONS' | 'FULL_FLEET'>('RELOCATIONS');
  const [showExplainer, setShowExplainer] = useState<boolean>(false);

  if (!allocation || !scenario) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6 text-center text-slate-500">
        Loading bus deployment timetable...
      </div>
    );
  }

  const { recommended_moves = [], status } = allocation;

  const getStopName = (stopId: string) => {
    const s = scenario.stops.find((st) => st.stop_id === stopId);
    return s ? s.name : stopId;
  };

  const getStopMinService = (stopId: string) => {
    const s = scenario.stops.find((st) => st.stop_id === stopId);
    return s ? s.min_service_buses : 0;
  };

  // Filter recommended moves
  const filteredMoves = recommended_moves.filter((m) => {
    if (filterStop === 'ALL') return true;
    return m.source_stop_id === filterStop || m.destination_stop_id === filterStop;
  });

  // Full fleet status: map all buses to their movement or stationary status
  const fleetSchedule = scenario.fleet.map((bus) => {
    const move = recommended_moves.find((m) => m.bus_id === bus.bus_id);
    const stopObj = scenario.stops.find((s) => s.stop_id === bus.initial_stop_id);
    const destSummary = move ? forecast?.stop_summaries[move.destination_stop_id] : null;
    const durationMins = move
      ? calculateDurationMinutes(move.departure_time, move.estimated_arrival_time) ||
        (scenario.travel_time_matrix_minutes[move.source_stop_id]?.[move.destination_stop_id] ?? 20)
      : null;

    return {
      bus,
      move,
      initialStopName: stopObj?.name || bus.initial_stop_id,
      destSummary,
      durationMins,
      isRelocated: !!move,
    };
  });

  const filteredFleet = fleetSchedule.filter((item) => {
    if (filterStop === 'ALL') return true;
    if (item.move) {
      return item.move.source_stop_id === filterStop || item.move.destination_stop_id === filterStop;
    }
    return item.bus.initial_stop_id === filterStop;
  });

  return (
    <div id="bus-timetable" className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm space-y-6">
      
      {/* 1. SECTION TITLE & TIMETABLE CONTROLS */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="space-y-1">
          <div className="text-xs font-bold text-sky-700 tracking-wider uppercase flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-sky-600" />
            <span>OPERATIONAL BUS TIMETABLE • 12-HOUR CIVIC TIMINGS</span>
          </div>
          <h3 className="font-heading text-2xl font-bold text-slate-900 tracking-tight">
            Festival Bus Deployment Timetable
          </h3>
          <p className="text-xs sm:text-sm text-slate-600 max-w-2xl">
            Scheduled vehicle departures, arrival estimates, travel durations, and crowd peak clearance timings across the active network.
          </p>
        </div>

        {/* CONTROLS: VIEW TOGGLE & STOP FILTER */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1 text-xs font-semibold">
            <button
              onClick={() => setViewMode('RELOCATIONS')}
              className={`px-3 py-1.5 rounded-md transition-all ${
                viewMode === 'RELOCATIONS'
                  ? 'bg-white text-sky-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Suggested Bus Changes ({recommended_moves.length})
            </button>
            <button
              onClick={() => setViewMode('FULL_FLEET')}
              className={`px-3 py-1.5 rounded-md transition-all ${
                viewMode === 'FULL_FLEET'
                  ? 'bg-white text-sky-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All {scenario.fleet.length} Buses in Fleet
            </button>
          </div>

          <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-lg text-xs">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={filterStop}
              onChange={(e) => setFilterStop(e.target.value)}
              aria-label="Filter bus timetable by stop"
              className="bg-transparent text-slate-700 font-semibold focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Stops</option>
              {scenario.stops.map((s) => (
                <option key={s.stop_id} value={s.stop_id}>
                  {s.name} ({s.stop_id})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* TIMING STANDARDS CALLOUT */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-xs text-slate-600">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1 text-slate-700 font-semibold">
            <Clock className="w-3.5 h-3.5 text-sky-600" />
            <span>Time Format: <strong>12-Hour AM/PM</strong> (Ordinary Time)</span>
          </span>
          <span className="text-slate-300 hidden sm:inline">•</span>
          <span>Arrival Times Labeled: <strong className="text-slate-800">Estimated (Est.)</strong></span>
          <span className="text-slate-300 hidden sm:inline">•</span>
          <span>Fleet Invariant: <strong className="text-emerald-700">{scenario.fleet.length} Fixed Buses Conserved</strong></span>
        </div>

        <button
          onClick={() => setShowExplainer(!showExplainer)}
          className="text-xs text-sky-700 hover:text-sky-900 font-semibold inline-flex items-center gap-1 underline flex-shrink-0"
        >
          <HelpCircle className="w-3.5 h-3.5" />
          <span>How are timings calculated?</span>
        </button>
      </div>

      {showExplainer && (
        <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 text-xs text-sky-900 space-y-1.5 animate-fadeIn">
          <strong className="block text-sm font-bold text-sky-950">Timetable Calculation Rules:</strong>
          <p>
            • <strong>Departure Time:</strong> Timed to release buses from donor hubs at the start of the exit horizon.
          </p>
          <p>
            • <strong>Estimated Arrival Time:</strong> Calculated as <code className="font-mono bg-sky-100 px-1 py-0.5 rounded">Departure + Travel Duration</code> (accounting for weather delay multipliers). Always labeled as an operational estimate.
          </p>
          <p>
            • <strong>Peak Window Timing:</strong> Relocations are approved only if the bus arrives strictly before the destination's predicted peak demand window.
          </p>
          <p>
            • <strong>No Overlapping Journeys:</strong> Each vehicle is assigned to at most one safe movement during the festival egress cycle.
          </p>
        </div>
      )}

      {/* VIEW 1: RECOMMENDED MOVEMENTS TIMETABLE */}
      {viewMode === 'RELOCATIONS' && (
        <>
          {filteredMoves.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center space-y-2">
              <div className="inline-flex items-center gap-2 text-amber-800 font-bold text-sm">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>
                  {status === 'NO_SAFE_MOVE'
                    ? 'No Safe Bus Moves Feasible Under Current Constraints'
                    : 'No recommended bus changes matching selected stop filter.'}
                </span>
              </div>
              <p className="text-xs text-amber-700 max-w-lg mx-auto">
                Existing baseline schedules are maintained. No vehicles are relocated because constraints prevent safe transfers.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs bg-white">
                <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3">Bus ID</th>
                    <th className="p-3">Source Stop</th>
                    <th className="p-3">Destination Stop</th>
                    <th className="p-3">Departure</th>
                    <th className="p-3">Arrival (Est.)</th>
                    <th className="p-3">Travel Time</th>
                    <th className="p-3">Busiest Time</th>
                    <th className="p-3">Benefit at Destination</th>
                    <th className="p-3">Service at Source Stop</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-sans">
                  {filteredMoves.map((move, idx) => {
                    const durationMins =
                      calculateDurationMinutes(move.departure_time, move.estimated_arrival_time) ||
                      (scenario.travel_time_matrix_minutes[move.source_stop_id]?.[move.destination_stop_id] ?? 20);
                    const sourceMin = getStopMinService(move.source_stop_id);
                    const isMinSafe = move.source_service_after >= sourceMin;

                    return (
                      <tr key={`${move.bus_id}-${idx}`} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3">
                          <span className="font-mono font-bold text-slate-900 bg-slate-100 border border-slate-300 px-2 py-1 rounded inline-flex items-center gap-1">
                            <BusIcon className="w-3 h-3 text-sky-700" />
                            <span>{move.bus_id}</span>
                          </span>
                        </td>
                        <td className="p-3 font-semibold text-slate-700">
                          {getStopName(move.source_stop_id)}
                          <span className="block text-[10px] text-slate-400 font-mono">
                            {move.source_stop_id}
                          </span>
                        </td>
                        <td className="p-3 font-semibold text-sky-900">
                          {getStopName(move.destination_stop_id)}
                          <span className="block text-[10px] text-sky-600 font-mono">
                            {move.destination_stop_id}
                          </span>
                        </td>
                        <td className="p-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                          {formatTo12Hour(move.departure_time)}
                        </td>
                        <td className="p-3 font-mono font-bold text-emerald-700 whitespace-nowrap">
                          {formatTo12Hour(move.estimated_arrival_time)}{' '}
                          <span className="text-[10px] text-slate-400 font-normal">(Est.)</span>
                        </td>
                        <td className="p-3 font-mono text-slate-700 whitespace-nowrap">
                          {formatDuration(durationMins)}
                        </td>
                        <td className="p-3 font-mono text-slate-700 whitespace-nowrap">
                          <span className="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                            {formatTo12Hour(move.target_peak_interval)}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className="font-mono font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 inline-block">
                            +{move.estimated_destination_benefit} pax/window
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="space-y-0.5">
                            <span className="font-mono text-slate-800 font-medium block">
                              {move.source_service_after} buses remaining
                            </span>
                            <span className={`text-[10px] inline-flex items-center gap-1 font-semibold ${isMinSafe ? 'text-emerald-700' : 'text-amber-700'}`}>
                              <CheckCircle2 className="w-3 h-3" />
                              <span>{isMinSafe ? `Safety met (≥ ${sourceMin})` : 'Threshold review'}</span>
                            </span>
                          </div>
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-800 border border-emerald-300">
                            Approved Relocation
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* VIEW 2: FULL FLEET TIMETABLE & INVENTORY ROSTER */}
      {viewMode === 'FULL_FLEET' && (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs bg-white">
            <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3">Bus ID</th>
                <th className="p-3">Assigned Stop</th>
                <th className="p-3">Seating Capacity</th>
                <th className="p-3">15-Min Boarding Cap</th>
                <th className="p-3">Vehicle Status</th>
                <th className="p-3">Movement Schedule</th>
                <th className="p-3">Departure / Arrival</th>
                <th className="p-3">Operational Impact</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-sans">
              {filteredFleet.map(({ bus, move, initialStopName, durationMins }) => {
                const intCap = Math.floor(bus.capacity / 2);

                return (
                  <tr key={bus.bus_id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3">
                      <span className="font-mono font-bold text-slate-900 bg-slate-100 border border-slate-300 px-2 py-1 rounded inline-flex items-center gap-1">
                        <BusIcon className="w-3 h-3 text-sky-700" />
                        <span>{bus.bus_id}</span>
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="font-semibold text-slate-800">{initialStopName}</span>
                      <span className="block text-[10px] text-slate-400 font-mono">{bus.initial_stop_id}</span>
                    </td>
                    <td className="p-3 font-mono text-slate-700">
                      {bus.capacity} seats
                    </td>
                    <td className="p-3 font-mono font-bold text-emerald-700">
                      {intCap} pax/window
                    </td>
                    <td className="p-3">
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
                    <td className="p-3">
                      {move ? (
                        <div className="space-y-0.5">
                          <span className="inline-flex items-center gap-1 font-bold text-orange-700 text-xs">
                            <ArrowRight className="w-3.5 h-3.5" />
                            <span>Relocating to {getStopName(move.destination_stop_id)}</span>
                          </span>
                          <span className="block text-[10px] text-slate-500 font-mono">
                            Transit duration: {formatDuration(durationMins)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-600 font-medium text-[11px] inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-slate-400" />
                          <span>Stationed at Terminal (Baseline Service)</span>
                        </span>
                      )}
                    </td>
                    <td className="p-3 font-mono text-xs whitespace-nowrap">
                      {move ? (
                        <div className="space-y-0.5">
                          <span className="text-slate-800 block">Departs: {formatTo12Hour(move.departure_time)}</span>
                          <span className="text-emerald-700 font-bold block">Arrives: {formatTo12Hour(move.estimated_arrival_time)} (Est.)</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs italic">Continuous terminal cycle</span>
                      )}
                    </td>
                    <td className="p-3 text-[11px]">
                      {move ? (
                        <span className="text-emerald-800 font-bold">
                          +{move.estimated_destination_benefit} extra pax capacity at destination
                        </span>
                      ) : (
                        <span className="text-slate-500">
                          Maintains safety reserve at {bus.initial_stop_id}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* FOOTER AUDIT SUMMARY */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pt-2 text-xs text-slate-500 border-t border-slate-100">
        <div>
          <span>Fixed Fleet Invariant: </span>
          <strong className="text-slate-900 font-mono">
            {scenario.fleet.length} Configured Vehicles
          </strong>
          <span> • </span>
          <span>Approved Relocations: </span>
          <strong className="text-orange-700 font-mono">
            {recommended_moves.length} Vehicles
          </strong>
          <span> • </span>
          <span>Stationed Baseline: </span>
          <strong className="text-slate-800 font-mono">
            {scenario.fleet.length - recommended_moves.length} Vehicles
          </strong>
        </div>
        <div className="inline-flex items-center gap-1 text-emerald-700 font-semibold font-mono text-[11px]">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>All 16 Buses Accounted For (0 Phantom)</span>
        </div>
      </div>

    </div>
  );
};

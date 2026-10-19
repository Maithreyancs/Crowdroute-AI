import React, { useState, useMemo } from 'react';
import {
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { DemandIntervalEstimate, Stop } from '../types/api';
import { transformDemandChartData } from '../utils/chartData';
import { formatTo12Hour } from '../utils/timeFormat';
import { HelpCircle, Filter, Users, Bus, AlertTriangle } from 'lucide-react';

interface DemandChartProps {
  intervals: DemandIntervalEstimate[];
  stops?: Stop[];
}

export const DemandChart: React.FC<DemandChartProps> = ({ intervals, stops = [] }) => {
  const [selectedStopId, setSelectedStopId] = useState<string>('ALL');
  const [showTooltipInfo, setShowTooltipInfo] = useState<boolean>(false);

  // Extract unique stops from intervals if not provided
  const availableStops = useMemo(() => {
    if (stops.length > 0) return stops;
    const uniqueIds = Array.from(new Set(intervals.map((i) => i.stop_id)));
    return uniqueIds.map((id) => ({ stop_id: id, name: id }));
  }, [stops, intervals]);

  // Compute robust, verified chart points
  const chartResult = useMemo(() => {
    return transformDemandChartData(intervals, selectedStopId);
  }, [intervals, selectedStopId]);

  if (!intervals || intervals.length === 0) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-sm text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-300 p-6">
        <Users className="w-8 h-8 text-slate-400 mb-2" />
        <p className="font-semibold">No crowd prediction data available.</p>
        <p className="text-xs text-slate-400">Apply festival scenario parameters to generate the crowd curve.</p>
      </div>
    );
  }

  const selectedStopName = selectedStopId === 'ALL'
    ? 'All Bus Stops Combined'
    : availableStops.find((s) => s.stop_id === selectedStopId)?.name || selectedStopId;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 shadow-sm space-y-5">
      
      {/* HEADER & CITIZEN-FRIENDLY CONTROLS */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-slate-100">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="font-heading font-bold text-lg text-slate-900">
              Expected Crowd vs Bus Capacity
            </h3>
            <button
              type="button"
              onClick={() => setShowTooltipInfo(!showTooltipInfo)}
              className="text-slate-400 hover:text-sky-600 transition-colors"
              title="What does this mean?"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-slate-600">
            Compares anticipated passengers leaving against total bus carrying capacity in each 15-minute window for{' '}
            <strong className="text-slate-900">{selectedStopName}</strong>.
          </p>
        </div>

        {/* STOP SELECTOR FILTER */}
        <div className="flex items-center gap-2 self-end md:self-auto">
          <span className="text-xs font-semibold text-slate-600 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span>Show Location:</span>
          </span>
          <select
            value={selectedStopId}
            onChange={(e) => setSelectedStopId(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            <option value="ALL">All Stops Combined</option>
            {availableStops.map((stop) => (
              <option key={stop.stop_id} value={stop.stop_id}>
                {stop.name || stop.stop_id}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* EXPLANATORY ACCORDION / TOOLTIP */}
      {showTooltipInfo && (
        <div className="bg-sky-50 border border-sky-200 rounded-lg p-3 text-xs text-sky-900 space-y-1.5 animate-fadeIn">
          <div className="font-bold flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5 text-sky-600" />
            <span>What does this graph show?</span>
          </div>
          <p className="text-slate-700 leading-relaxed">
            • <strong>Expected Passengers (Sky Blue):</strong> The estimated number of festival attendees arriving at the bus stops during that 15-minute interval based on the event ending time.<br />
            • <strong>Bus Carrying Capacity (Emerald Green):</strong> The number of passengers our scheduled buses can safely board in that interval (based on a standard turnaround roundtrip).<br />
            • <strong>Red Warning Zones:</strong> Intervals where expected passengers exceed bus carrying capacity, creating dangerous overcrowding.
          </p>
        </div>
      )}

      {/* RECHARTS VISUALIZATION */}
      <div className="h-80 w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartResult.points}
            margin={{ top: 15, right: 15, left: 10, bottom: 5 }}
          >
            <defs>
              <linearGradient id="colorDemandGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0284c7" stopOpacity={0.45} />
                <stop offset="95%" stopColor="#0284c7" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="colorDeficitGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis
              dataKey="interval"
              tick={{ fill: '#475569', fontSize: 10, fontFamily: 'JetBrains Mono' }}
              axisLine={{ stroke: '#cbd5e1' }}
              tickLine={false}
              tickFormatter={(val) => formatTo12Hour(val)}
            />
            <YAxis
              domain={[0, chartResult.yAxisMax]}
              tick={{ fill: '#475569', fontSize: 11, fontFamily: 'JetBrains Mono' }}
              axisLine={{ stroke: '#cbd5e1' }}
              tickLine={false}
              tickFormatter={(val) => `${Number(val).toLocaleString()}`}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  const deficit = data.overcrowdingDeficit;
                  return (
                    <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-lg text-xs space-y-1.5 font-sans min-w-[210px]">
                      <div className="font-mono font-bold text-slate-900 border-b border-slate-100 pb-1">
                        Time: {formatTo12Hour(data.interval || data.timeLabel)}
                      </div>
                      <div className="flex justify-between items-center text-sky-700">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-sky-600"></span>
                          Expected Passengers:
                        </span>
                        <strong className="font-mono">{Number(data.expectedPassengers).toLocaleString()} pax</strong>
                      </div>
                      <div className="flex justify-between items-center text-emerald-700">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
                          Bus Capacity:
                        </span>
                        <strong className="font-mono">{Number(data.busCarryingCapacity).toLocaleString()} pax</strong>
                      </div>
                      {deficit > 0 ? (
                        <div className="flex justify-between items-center text-red-700 pt-1 border-t border-slate-100 font-semibold">
                          <span className="flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                            People Still Waiting:
                          </span>
                          <span className="font-mono">+{Number(deficit).toLocaleString()} pax</span>
                        </div>
                      ) : (
                        <div className="text-emerald-700 pt-1 border-t border-slate-100 text-[11px]">
                          ✓ Buses sufficient for crowd
                        </div>
                      )}
                    </div>
                  );
                }
                return null;
              }}
            />
            <Legend
              verticalAlign="top"
              height={36}
              content={() => (
                <div className="flex flex-wrap items-center justify-end gap-5 text-xs text-slate-700 mb-2">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-sky-600"></span>
                    <strong className="text-slate-900">Expected Passengers</strong>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-1 bg-emerald-600 border-t-2 border-emerald-600"></span>
                    <strong className="text-slate-900">Bus Capacity</strong>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-red-400"></span>
                    <span className="text-slate-600">People Still Waiting</span>
                  </span>
                </div>
              )}
            />
            {/* Expected Passengers Series */}
            <Area
              type="monotone"
              dataKey="expectedPassengers"
              name="Expected Passengers"
              stroke="#0284c7"
              strokeWidth={3}
              fill="url(#colorDemandGradient)"
              fillOpacity={1}
            />
            {/* Bus Carrying Capacity Series */}
            <Line
              type="stepAfter"
              dataKey="busCarryingCapacity"
              name="Bus Carrying Capacity"
              stroke="#059669"
              strokeWidth={2.5}
              strokeDasharray="4 4"
              dot={{ r: 3, fill: '#059669' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* SUMMARY STATS STRIP BELOW GRAPH */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-100 text-xs">
        <div className="bg-slate-50 rounded-lg p-2.5">
          <span className="text-slate-500 block">Peak Expected Passengers:</span>
          <span className="font-mono font-bold text-slate-900 text-sm">
            {chartResult.maxExpectedPassengers.toLocaleString()} pax/interval
          </span>
        </div>
        <div className="bg-slate-50 rounded-lg p-2.5">
          <span className="text-slate-500 block">Scheduled Bus Capacity:</span>
          <span className="font-mono font-bold text-emerald-700 text-sm">
            {chartResult.maxCarryingCapacity.toLocaleString()} pax/interval
          </span>
        </div>
        <div className="bg-slate-50 rounded-lg p-2.5">
          <span className="text-slate-500 block">People Still Waiting at Peak:</span>
          <span className="font-mono font-bold text-amber-700 text-sm">
            {chartResult.maxExpectedPassengers > chartResult.maxCarryingCapacity
              ? `${(chartResult.maxExpectedPassengers - chartResult.maxCarryingCapacity).toLocaleString()} people waiting`
              : '0 (None waiting)'}
          </span>
        </div>
      </div>

    </div>
  );
};

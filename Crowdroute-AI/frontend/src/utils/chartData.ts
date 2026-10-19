/**
 * Utility functions for transforming DemandIntervalEstimate API records into
 * mathematically sound, aligned charting series for Recharts.
 */

import { DemandIntervalEstimate } from '../types/api';

export interface TransformedIntervalPoint {
  interval: string;
  timeLabel: string;
  expectedPassengers: number;
  busCarryingCapacity: number;
  lowEstimate: number;
  highEstimate: number;
  overcrowdingDeficit: number;
  hasCapacityDeficit: boolean;
  stopBreakdown: Record<string, { demand: number; capacity: number }>;
}

export interface ChartTransformationResult {
  points: TransformedIntervalPoint[];
  maxExpectedPassengers: number;
  maxCarryingCapacity: number;
  yAxisMax: number;
  totalSystemDemand: number;
  totalSystemCapacity: number;
}

/**
 * Transforms API interval estimates into robust, verified chart points.
 * Handles single stop filtering or network-wide aggregation.
 * Correctly matches intervals and avoids mixing cumulative vs interval values.
 */
export function transformDemandChartData(
  intervals: DemandIntervalEstimate[] | null | undefined,
  selectedStopId: string = 'ALL'
): ChartTransformationResult {
  if (!intervals || !Array.isArray(intervals) || intervals.length === 0) {
    return {
      points: [],
      maxExpectedPassengers: 0,
      maxCarryingCapacity: 0,
      yAxisMax: 100,
      totalSystemDemand: 0,
      totalSystemCapacity: 0,
    };
  }

  // Filter if a specific stop is selected
  const filtered = selectedStopId === 'ALL'
    ? intervals
    : intervals.filter((item) => item.stop_id === selectedStopId);

  // Group by interval time key, preserving chronological order
  const groupMap: Map<string, {
    start: string;
    end: string;
    expected: number;
    capacity: number;
    low: number;
    high: number;
    breakdown: Record<string, { demand: number; capacity: number }>;
  }> = new Map();

  for (const item of filtered) {
    if (!item.start_time || !item.end_time) continue;
    const key = `${item.start_time}-${item.end_time}`;

    if (!groupMap.has(key)) {
      groupMap.set(key, {
        start: item.start_time,
        end: item.end_time,
        expected: 0,
        capacity: 0,
        low: 0,
        high: 0,
        breakdown: {},
      });
    }

    const g = groupMap.get(key)!;
    const demand = Math.max(0, Number(item.central_estimate) || 0);
    const capacity = Math.max(0, Number(item.baseline_capacity) || 0);
    const low = Math.max(0, Number(item.low_estimate) || 0);
    const high = Math.max(0, Number(item.high_estimate) || 0);

    g.expected += demand;
    g.capacity += capacity;
    g.low += low;
    g.high += high;
    g.breakdown[item.stop_id] = { demand, capacity };
  }

  // Convert to points array and calculate stats
  let maxExpected = 0;
  let maxCapacity = 0;
  let totalDemand = 0;
  let totalCapacity = 0;

  const points: TransformedIntervalPoint[] = [];

  for (const [key, g] of groupMap.entries()) {
    if (g.expected > maxExpected) maxExpected = g.expected;
    if (g.capacity > maxCapacity) maxCapacity = g.capacity;
    totalDemand += g.expected;
    totalCapacity += g.capacity;

    const deficit = Math.max(0, g.expected - g.capacity);

    points.push({
      interval: key,
      timeLabel: `${g.start} - ${g.end}`,
      expectedPassengers: g.expected,
      busCarryingCapacity: g.capacity,
      lowEstimate: g.low,
      highEstimate: g.high,
      overcrowdingDeficit: deficit,
      hasCapacityDeficit: deficit > 0,
      stopBreakdown: g.breakdown,
    });
  }

  // Calculate suitable Y-axis max with 15% headroom to prevent peak truncation
  const highestVal = Math.max(maxExpected, maxCapacity);
  const yAxisMax = highestVal > 0 ? Math.ceil(highestVal * 1.15) : 500;

  return {
    points,
    maxExpectedPassengers: maxExpected,
    maxCarryingCapacity: maxCapacity,
    yAxisMax,
    totalSystemDemand: totalDemand,
    totalSystemCapacity: totalCapacity,
  };
}

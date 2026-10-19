/**
 * Automated verification test suite for Demand Chart Data Transformation.
 * Validates values > 1,000, missing values, filtering, and peak scaling.
 */

import assert from 'node:assert';
import { transformDemandChartData } from './src/utils/chartData.js';

console.log('--- RUNNING CHART DATA TRANSFORMATION TEST SUITE ---');

// Test 1: Empty or null data
const emptyRes = transformDemandChartData(null);
assert.strictEqual(emptyRes.points.length, 0);
assert.strictEqual(emptyRes.maxExpectedPassengers, 0);
assert.strictEqual(emptyRes.yAxisMax, 100);
console.log('✓ Test 1 Passed: Empty and null inputs handled safely.');

// Test 2: Real high-demand scenario with values > 1,000
const sampleIntervals = [
  {
    stop_id: 'STOP_MAIN',
    interval_index: 0,
    start_time: '21:00',
    end_time: '21:15',
    low_estimate: 80,
    central_estimate: 95,
    high_estimate: 114,
    baseline_capacity: 364,
    deficit_surplus: -269,
    risk_level: 'LOW',
    provenance_note: 'Test',
  },
  {
    stop_id: 'STOP_MAIN',
    interval_index: 2,
    start_time: '21:30',
    end_time: '21:45',
    low_estimate: 6872,
    central_estimate: 8085, // > 1,000 peak!
    high_estimate: 9702,
    baseline_capacity: 364,
    deficit_surplus: 7721,
    risk_level: 'CRITICAL',
    provenance_note: 'Peak surge',
  },
  {
    stop_id: 'STOP_PERIPHERAL',
    interval_index: 2,
    start_time: '21:30',
    end_time: '21:45',
    low_estimate: 38,
    central_estimate: 45,
    high_estimate: 54,
    baseline_capacity: 120,
    deficit_surplus: -75,
    risk_level: 'LOW',
    provenance_note: 'Idle ring stop',
  },
];

const resAll = transformDemandChartData(sampleIntervals, 'ALL');
assert.strictEqual(resAll.points.length, 2);
// In 21:30-21:45, combined demand should be 8085 + 45 = 8130
const peakPt = resAll.points.find((p) => p.interval === '21:30-21:45');
assert(peakPt, 'Peak point must exist');
assert.strictEqual(peakPt.expectedPassengers, 8130);
assert.strictEqual(peakPt.busCarryingCapacity, 484); // 364 + 120
assert.strictEqual(peakPt.hasCapacityDeficit, true);
assert(resAll.yAxisMax >= 8130 * 1.15, `Y-axis max (${resAll.yAxisMax}) must exceed peak (8130)`);
console.log(`✓ Test 2 Passed: High-demand peaks (> 1,000 pax: ${peakPt.expectedPassengers}) correctly computed, yAxisMax = ${resAll.yAxisMax}`);

// Test 3: Stop-specific filtering
const resMain = transformDemandChartData(sampleIntervals, 'STOP_MAIN');
const mainPeak = resMain.points.find((p) => p.interval === '21:30-21:45');
assert.strictEqual(mainPeak.expectedPassengers, 8085);
assert.strictEqual(mainPeak.busCarryingCapacity, 364);

const resPeriph = transformDemandChartData(sampleIntervals, 'STOP_PERIPHERAL');
assert.strictEqual(resPeriph.points.length, 1);
assert.strictEqual(resPeriph.points[0].expectedPassengers, 45);
assert.strictEqual(resPeriph.points[0].busCarryingCapacity, 120);
assert.strictEqual(resPeriph.points[0].hasCapacityDeficit, false);
console.log('✓ Test 3 Passed: Individual stop filtering correctly isolates stop-specific demand and carrying capacity.');

// Test 4: Mismatched intervals and missing components
const malformed = [
  { stop_id: 'STOP_A', interval_index: 0, start_time: '', end_time: '21:15', central_estimate: 50, baseline_capacity: 50 },
  { stop_id: 'STOP_A', interval_index: 1, start_time: '21:15', end_time: '21:30', central_estimate: null, baseline_capacity: undefined },
];
const resMalformed = transformDemandChartData(malformed);
assert.strictEqual(resMalformed.points.length, 1);
assert.strictEqual(resMalformed.points[0].expectedPassengers, 0);
assert.strictEqual(resMalformed.points[0].busCarryingCapacity, 0);
console.log('✓ Test 4 Passed: Malformed time strings and null components handled without NaN or crashes.');

console.log('--- ALL CHART DATA TRANSFORMATION TESTS PASSED SUCCESSFULLY! ---');

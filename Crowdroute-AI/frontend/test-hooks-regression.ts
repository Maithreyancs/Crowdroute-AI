import React from 'react';
import { FestivalScenarioControlCenter } from './src/components/FestivalScenarioControlCenter';
import { ScenarioData, ForecastResponse } from './src/types/api';

console.log('--- RUNNING FESTIVAL SCENARIO CONTROL CENTER HOOKS REGRESSION TEST ---');

// Type-safe assertion helpers
function assert(condition: any, message?: string): asserts condition {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}
assert.strictEqual = function (actual: any, expected: any, message?: string) {
  if (actual !== expected) {
    throw new Error(message || `Assertion failed: expected ${expected}, got ${actual}`);
  }
};
assert.ok = function (condition: any, message?: string) {
  assert(condition, message);
};

const mockScenario: ScenarioData = {
  scenario_metadata: {
    scenario_id: 'test-demo',
    title: 'Test Scenario',
    data_nature: 'SYNTHETIC',
    disclaimer: 'Testing baseline',
    created_for: 'Unit Regression Test',
    configured_fleet_assumption: '16',
  },
  festival_programme: {
    event_name: 'Festival Egress Demo',
    event_date: '2026-10-11',
    event_end_date: '2026-10-11',
    event_start_time: '18:00',
    scheduled_event_end_time: '22:00',
    event_delay_minutes: 0,
    timezone: 'Asia/Kolkata',
    forecast_horizon_hours: 24,
    time_horizon: {
      start_time: '21:00',
      end_time: '23:30',
      interval_minutes: 15,
    },
    expected_total_attendance: 40000,
    exiting_passenger_fraction: 0.85,
    demand_distribution: {
      STOP_MAIN: 0.60,
      STOP_PERIPHERAL: 0.25,
      STOP_EAST_GATE: 0.15,
    },
  },
  weather: {
    condition: 'clear',
    surge_concentration_factor: 1.0,
    travel_time_multiplier: 1.0,
    source: 'manual_scenario',
  },
  travel_time_matrix_minutes: {
    STOP_MAIN: { STOP_MAIN: 0, STOP_PERIPHERAL: 15, STOP_EAST_GATE: 10 },
  },
  fleet: [
    {
      bus_id: 'BUS-01',
      capacity: 60,
      initial_stop_id: 'STOP_MAIN',
      status: 'available',
      compatible_stops: ['STOP_MAIN'],
      compatible_routes: ['ROUTE-01'],
    },
    {
      bus_id: 'BUS-02',
      capacity: 60,
      initial_stop_id: 'STOP_MAIN',
      status: 'available',
      compatible_stops: ['STOP_MAIN'],
      compatible_routes: ['ROUTE-01'],
    },
  ],
  stops: [
    {
      stop_id: 'STOP_MAIN',
      name: 'Main Gate Terminal',
      description: 'Primary Festival Egress Hub',
      min_service_buses: 2,
      baseline_scheduled_buses: 4,
      supported_routes: ['ROUTE-01'],
      latitude: 12.2335,
      longitude: 79.0730,
    },
  ],
};

const mockForecast: ForecastResponse = {
  scenario_id: 'test-demo',
  disclaimer: 'Test Forecast',
  event_end_time: '22:00',
  weather_condition: 'clear',
  assumptions: [],
  data_provenance: 'Synthetic model',
  operational_mode: 'DEMO_SYNTHETIC',
  confidence_level: 'HIGH',
  confidence_indicator: 'High Confidence',
  intervals: [],
  stop_summaries: {
    STOP_MAIN: {
      stop_id: 'STOP_MAIN',
      total_demand: 20400,
      peak_demand: 8085,
      peak_interval: '21:30',
      baseline_scheduled_capacity: 400,
      overall_risk: 'HIGH',
    },
  },
};

// React internal dispatcher simulation to track exact hook order and counts across renders
const ReactDispatcher = (React as any).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher;

let hookCallsInCurrentRender: string[] = [];
let renderHistory: string[][] = [];

const trackedDispatcher = {
  useState: (initial: any) => {
    hookCallsInCurrentRender.push('useState');
    const val = typeof initial === 'function' ? initial() : initial;
    return [val, () => {}];
  },
  useEffect: (_create: any, _deps: any) => {
    hookCallsInCurrentRender.push('useEffect');
  },
  useRef: (initial: any) => {
    hookCallsInCurrentRender.push('useRef');
    return { current: initial };
  },
  useMemo: (factory: any, _deps: any) => {
    hookCallsInCurrentRender.push('useMemo');
    return factory();
  },
  useCallback: (callback: any, _deps: any) => {
    hookCallsInCurrentRender.push('useCallback');
    return callback;
  },
  useContext: () => {
    hookCallsInCurrentRender.push('useContext');
  },
};

function renderComponent(props: any) {
  hookCallsInCurrentRender = [];
  ReactDispatcher.current = trackedDispatcher;
  
  let element: any;
  try {
    element = (FestivalScenarioControlCenter as any)(props);
  } finally {
    // Check hook consistency against previous renders
    if (renderHistory.length > 0) {
      const prevHooks = renderHistory[renderHistory.length - 1];
      if (prevHooks.length !== hookCallsInCurrentRender.length) {
        throw new Error(
          `Rendered ${hookCallsInCurrentRender.length > prevHooks.length ? 'more' : 'fewer'} hooks than during the previous render.\n` +
          `Previous count: ${prevHooks.length} [${prevHooks.join(', ')}]\n` +
          `Current count: ${hookCallsInCurrentRender.length} [${hookCallsInCurrentRender.join(', ')}]`
        );
      }
      for (let i = 0; i < prevHooks.length; i++) {
        if (prevHooks[i] !== hookCallsInCurrentRender[i]) {
          throw new Error(
            `Hook order mismatch at index ${i}: expected ${prevHooks[i]}, got ${hookCallsInCurrentRender[i]}`
          );
        }
      }
    }
    renderHistory.push([...hookCallsInCurrentRender]);
  }
  return element;
}

// =========================================================================
// TEST 1: Initial Render with scenario = null (loading state)
// =========================================================================
console.log('\n[Test 1] Initial Render with scenario = null (loading branch)');
const render1 = renderComponent({
  scenario: null,
  forecast: null,
  onRunPrediction: () => {},
  onResetDefaults: () => {},
});
assert.ok(render1 != null, 'Render 1 produced element');
const render1Count = renderHistory[0].length;
console.log(`✓ Render 1 successful: executed ${render1Count} hooks in sequence: ${renderHistory[0].join(', ')}`);

// =========================================================================
// TEST 2: Second Render with scenario populated (active branch transition)
// This was the exact transition where "Rendered more hooks" previously crashed!
// =========================================================================
console.log('\n[Test 2] Second Render with scenario populated (active branch transition)');
const render2 = renderComponent({
  scenario: mockScenario,
  forecast: mockForecast,
  onRunPrediction: () => {},
  onResetDefaults: () => {},
});
assert.ok(render2 != null, 'Render 2 produced element');
const render2Count = renderHistory[1].length;
assert.strictEqual(
  render2Count,
  render1Count,
  `Hook count must be identical across loading and loaded renders (got ${render2Count} vs ${render1Count})`
);
console.log(`✓ Render 2 successful: executed identical ${render2Count} hooks with identical sequence.`);

// =========================================================================
// TEST 3: Repeated updates and input state modifications
// =========================================================================
console.log('\n[Test 3] Subsequent renders with updated scenario data & live weather updates');
for (let i = 0; i < 5; i++) {
  const updatedScenario = {
    ...mockScenario,
    festival_programme: {
      ...mockScenario.festival_programme,
      expected_total_attendance: 40000 + i * 5000,
    },
  };
  const renderN = renderComponent({
    scenario: updatedScenario,
    forecast: mockForecast,
    onRunPrediction: () => {},
    onResetDefaults: () => {},
  });
  assert.ok(renderN != null);
}
console.log(`✓ Renders 3-7 successful: all executed identical ${render1Count} hooks.`);

// =========================================================================
// TEST 4: Transition back to scenario = null (reset / reload)
// =========================================================================
console.log('\n[Test 4] Transition back to scenario = null (unloading)');
const renderReset = renderComponent({
  scenario: null,
  forecast: null,
  onRunPrediction: () => {},
  onResetDefaults: () => {},
});
assert.ok(renderReset != null);
console.log(`✓ Unload Render successful: executed identical ${render1Count} hooks.`);

console.log('\n======================================================');
console.log(`ALL HOOKS REGRESSION TESTS PASSED! (${renderHistory.length} consecutive renders verified)`);
console.log(`Hook signature per render: ${renderHistory[0].join(' -> ')}`);
console.log('Zero hook count divergence across all branch transitions.');
console.log('======================================================');

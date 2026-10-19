# CrowdRoute AI — Backend Service

**Festival Crowd Prediction and Fixed-Fleet Bus Optimization**  
**Hackathon:** SAKTHI HACKFEST'26 — Generative AI Domain  
**Status:** Phase 1 Backend MVP (Completed & Verified)

---

> [!WARNING]
> **DISCLAIMER: SYNTHETIC DEMO DATA ONLY**  
> All passenger demand numbers, egress curves, and bus arrival estimates are generated from synthetic demo models for planning and demonstration purposes. They must **NOT** be used for real-world passenger dispatch or life-critical transport operations.

---

## 1. Overview & Problem Context

On the closing night of a major temple festival, approximately **40,000 attendees** seek to depart a small town within a two-hour window (21:00 to 23:00). 

- **The Problem:** The Main Bus Stand (12 scheduled buses) rapidly experiences severe bottlenecks and crushing queues within 30 minutes. Meanwhile, 2 km away, a Peripheral Ring Stop has 4 buses waiting idle with almost no passengers.
- **The Core Constraint (Constraint 2):** **The fleet is strictly fixed.** The system cannot magically create new buses or deploy emergency vehicles. It may only redistribute existing buses and must explicitly account for which route or stop loses service as a result of every move.
- **The Guiding Insight:** Moving 1 bus to the right place at the right time is worth more than adding 10 buses too late.

CrowdRoute AI provides an explainable, deterministic rule-based demand forecasting and fixed-fleet optimization system that responds dynamically to user-provided data, historical records, and operational constraints without depending on hardcoded demo values.

---

## 2. Supported Data Sources & Operating Modes

The system explicitly supports four distinct data sources and never conflates synthetic estimates with real-world observations:

1. **Manual Input (`USER_MANUAL`):** Full control to enter or edit festival attendance, event conclusion time, time horizons, transit stops, demand shares, and vehicle fleet rosters.
2. **Historical Data (`HISTORICAL_RECORDS`):** Drag-and-drop ingestion of previous festival passenger counts and time-wise boarding records (.csv or .xlsx). Validates timestamps, maps columns, and drives empirical time-of-day demand profiling.
3. **Current / Live Data (`LIVE_API`):** Transparent monitor for live regional weather forecasts and GTFS-Realtime bus telemetry. Honestly reports when external feeds are unconfigured or unavailable; never invents fake telemetry.
4. **Synthetic Data (`SYNTHETIC_DEMO`):** Baseline reference scenario (Maha Deepam finale) clearly labeled as synthetic demo data for demonstrations and automated benchmarks.

### Operational Modes:
- **`DEMO_SYNTHETIC`:** Uses validated synthetic scenario data with clear disclaimers.
- **`USER_DATA`:** Strictly requires user inputs, validates completeness, and rejects runs with missing critical data.

---

## 3. Architecture & Modules

```
backend/
├── app/
│   ├── __init__.py       # Package initialization
│   ├── models.py         # Pydantic schemas, strict data validations, and domain types
│   ├── forecast.py       # Dynamic demand forecasting & empirical historical profiling
│   ├── allocator.py      # Constrained greedy fixed-fleet reallocation engine
│   ├── tradeoffs.py      # Operational constraint validator & source-service impact analyzer
│   ├── simulator.py      # Deterministic discrete interval queue and transit simulator
│   ├── historical.py     # CSV/Excel parsing, column mapping, and actual vs predicted evaluation
│   ├── live_data.py      # Truthful external live feed monitor (weather & GTFS-RT)
│   ├── main.py           # FastAPI application & REST endpoints
│   └── static/           # Interactive Web Dashboard (HTML5, Vanilla CSS, JS)
│       ├── index.html
│       ├── style.css
│       └── app.js
├── data/
│   └── demo_scenario.json # Reference synthetic festival scenario (16 buses, 3 stops, travel matrix)
├── tests/
│   ├── __init__.py
│   ├── test_all.py       # Core constraint verification suite (21 tests)
│   ├── test_api.py       # FastAPI HTTP endpoint tests
│   └── test_dynamic.py   # Dynamic input, historical calibration & validation suite (11 tests)
├── requirements.txt      # Python dependencies
└── README.md             # Backend documentation
```

---

## 3. Operational Constraints Enforced

Every proposed bus relocation must pass all hard constraints:

1. **Strict Fleet Conservation:** No bus is ever added, duplicated, or removed. The inventory count before and after allocation is audited and guaranteed identical.
2. **Vehicle Operational Availability:** Only buses with `status == "available"` may be dispatched. Vehicles marked `maintenance` or `offline` are rejected.
3. **Route Compatibility:** The destination stop and route must be compatible with the bus's authorized operating envelope.
4. **Peak Arrival Window:** The vehicle must depart and complete road transit *before* the destination's peak demand interval begins. A bus arriving after the peak has started is rejected as ineffective.
5. **Minimum Source Service:** Relocating a bus must **never** reduce the active fleet at the donor stop below its configured `min_service_buses` safety baseline.
6. **Explicit Source-Service Impact:** Every recommendation calculates and exposes the exact service loss (initial buses, remaining buses, capacity drop, and unserved passengers at the source). If source impact cannot be calculated, the move is rejected.
7. **Net Positive Benefit:** The move is only recommended if the relieved bottleneck at the destination strictly exceeds any resulting deficit at the donor stop.

---

## 4. Setup & Running Instructions (Windows 11)

### Step 1: Open PowerShell in Project Root
```powershell
cd "d:\CrowdRoute AI"
```

### Step 2: Activate the Virtual Environment
```powershell
.\.venv\Scripts\Activate.ps1
```

### Step 3: Install Dependencies
```powershell
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
```

### Step 4: Run the Test Suite
```powershell
.\.venv\Scripts\python.exe -m pytest backend\tests -v
```

### Step 5: Start the FastAPI Development Server
```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

Interactive Web Dashboard is available at:  
👉 **http://127.0.0.1:8000/**  
Interactive Swagger API documentation is available at:  
👉 **http://127.0.0.1:8000/docs**

---

## 5. API Endpoints & Example Payloads

### `GET /`
Serves the interactive single-page web dashboard for scenario editing, CSV/Excel upload, live stream status, predictions, and side-by-side simulation.

---

### `GET /health`
Returns service status, active modes, and domain metadata.

**Response (200 OK):**
```json
{
  "status": "healthy",
  "service": "CrowdRoute AI",
  "version": "1.1.0",
  "hackathon": "SAKTHI HACKFEST'26",
  "domain": "Generative AI Domain - Festival Transit Management",
  "supported_modes": ["DEMO_SYNTHETIC", "USER_DATA"],
  "supported_data_sources": ["MANUAL_INPUT", "HISTORICAL_RECORDS", "LIVE_API", "SYNTHETIC_DEMO"],
  "disclaimer": "SYNTHETIC DEMO & PLANNING ENGINE ONLY. Never invent real-world physical measurements."
}
```

---

### `POST /api/historical/upload`
Uploads and validates a historical CSV or Excel file (`.xlsx`) containing previous festival passenger logs.
- Detects column mapping (`time`, `stop_id`, `passengers`).
- Validates row timestamps ($00:00$ to $23:59$) and non-negative counts.
- Flags and isolates corrupted lines with specific line numbers.

---

### `GET /api/historical/sample`
Downloads verified sample festival historical CSV dataset for immediate testing.

---

### `GET /api/live/status`
Reports honest status of external live weather and published transit feeds. Truthfully indicates whether endpoints are configured, online, or unavailable.

---

### `POST /api/validate/scenario`
Pre-validates user-supplied scenario parameters for `USER_DATA` mode, verifying stops, non-empty demand distributions, and positive attendance.

---

### `GET /api/scenario`
Returns the active synthetic demonstration scenario (stops, travel times, fleet inventory, festival schedule).

---

### `POST /api/forecast`
Generates explainable passenger demand forecasts across 15-minute intervals.

**Example Request:**
```json
{
  "scheduled_event_end_time_override": "21:30",
  "weather_condition_override": "clear",
  "attendance_override": 40000
}
```

**Example Response:**
```json
{
  "scenario_id": "SCN-SAKTHI-FEST-2026-01",
  "disclaimer": "SYNTHETIC DEMO DATA ONLY - Not real passenger measurements",
  "event_end_time": "21:30",
  "weather_condition": "clear",
  "intervals": [
    {
      "stop_id": "STOP_MAIN",
      "interval_index": 2,
      "start_time": "21:30",
      "end_time": "21:45",
      "low_estimate": 6872,
      "central_estimate": 8085,
      "high_estimate": 9702,
      "baseline_capacity": 364,
      "deficit_surplus": 7721,
      "risk_level": "CRITICAL",
      "provenance_note": "Synthetic rule-based estimate: 90.0% stop split, weight=0.2642 from egress curve centered at event end 21:30. Weather=clear (concentration=1.0)."
    }
  ],
  "stop_summaries": {
    "STOP_MAIN": {
      "stop_id": "STOP_MAIN",
      "total_demand": 30601,
      "peak_interval": "21:30-21:45",
      "peak_demand": 8085,
      "baseline_scheduled_capacity": 2912,
      "overall_risk": "CRITICAL"
    },
    "STOP_PERIPHERAL": {
      "stop_id": "STOP_PERIPHERAL",
      "total_demand": 171,
      "peak_interval": "21:30-21:45",
      "peak_demand": 45,
      "baseline_scheduled_capacity": 960,
      "overall_risk": "LOW"
    },
    "STOP_EAST_GATE": {
      "stop_id": "STOP_EAST_GATE",
      "total_demand": 3229,
      "peak_interval": "21:30-21:45",
      "peak_demand": 853,
      "baseline_scheduled_capacity": 0,
      "overall_risk": "CRITICAL"
    }
  },
  "assumptions": [
    "Synthetic demand distribution: Total attendance assumed 40,000 people.",
    "85% of attendees leave via municipal transit network.",
    "Event end time: 21:30; egress curve standard deviation: 24.0 minutes.",
    "Weather mode: clear with surge concentration factor 1.0.",
    "Standardized 15-minute boarding capacity assumption: floor(capacity / 2) passengers per bus per 15-min interval (e.g., 30 for 60-seat, 32 for 65-seat).",
    "Demand estimates are strictly synthetic baselines for planning and comparison only."
  ],
  "data_provenance": "Deterministic rule-based Gaussian egress model over synthetic scenario data."
}
```

---

### `POST /api/allocate`
Evaluates existing buses and generates constrained reallocation recommendations.

**Example Request:**
```json
{
  "max_moves": 5
}
```

**Example Response:**
```json
{
  "scenario_id": "SCN-SAKTHI-FEST-2026-01",
  "disclaimer": "SYNTHETIC DEMO ESTIMATE ONLY - Fixed Fleet Heuristic Allocation",
  "status": "SUCCESS",
  "summary": "Recommended 3 safe fixed-fleet reallocations relieving critical crowd bottlenecks while preserving source minimum service levels. Fleet inventory strictly conserved at 16 vehicles.",
  "recommended_moves": [
    {
      "bus_id": "BUS-P01",
      "source_stop_id": "STOP_PERIPHERAL",
      "destination_stop_id": "STOP_MAIN",
      "departure_time": "21:00",
      "estimated_arrival_time": "21:15",
      "target_peak_interval": "21:30-21:45",
      "destination_need_reason": "Destination stop 'Main Bus Stand (Central Terminal)' (STOP_MAIN) faces severe peak demand deficit of 7721 passengers during interval 21:30-21:45.",
      "estimated_destination_benefit": 30,
      "source_service_before": 4,
      "source_service_after": 3,
      "source_service_impact_description": "Source stop 'Peripheral Ring Stop (North Bypass)' (STOP_PERIPHERAL) loses 1 bus (Bus BUS-P01, capacity 60, 15-min capacity 30). Scheduled fleet decreases from 4 to 3 buses (15-min capacity 120 -> 90). Minimum safety requirement of 1 bus(es) is satisfied.",
      "delayed_or_unserved_passengers_at_source": 0,
      "constraints_passed": [
        "HARD_CONSTRAINT_SOURCE_IMPACT_KNOWABILITY: Source impact fully quantified",
        "HARD_CONSTRAINT_DESTINATION_VALIDITY: Destination verified in network",
        "HARD_CONSTRAINT_BUS_AVAILABILITY: Vehicle status confirmed available",
        "HARD_CONSTRAINT_ROUTE_COMPATIBILITY: Route and stop authorized for vehicle",
        "HARD_CONSTRAINT_PEAK_ARRIVAL_WINDOW: Bus arrives at 21:15 ahead of peak 21:30-21:45",
        "HARD_CONSTRAINT_MINIMUM_SOURCE_SERVICE: Source retains 3 buses (min 1 required)",
        "HARD_CONSTRAINT_NET_BENEFIT_POSITIVE: Net gain of +30 passengers accommodated"
      ],
      "assumptions": [
        "Travel time: 15 mins (includes weather multiplier 1.00).",
        "Standardized 15-minute boarding capacity assumption: floor(60 / 2) = 30 passengers per interval.",
        "Source passenger demand for period estimated at 45 passengers."
      ],
      "status": "RECOMMENDED"
    }
  ],
  "rejected_moves": [],
  "fleet_audit": {
    "initial_fleet_count": 16,
    "final_fleet_count": 16,
    "inventory_conserved": true,
    "duplicate_buses_detected": false,
    "invented_buses_detected": false,
    "missing_buses_detected": false,
    "details": "Initial fleet: 16 vehicles. Final fleet: 16 vehicles. Moved vehicles: 3. Inventory conservation: PASSED."
  }
}
```

---

### `POST /api/simulate`
Executes side-by-side discrete interval simulation comparing original fixed schedule vs proposed allocation under identical arrivals.

**Example Request:**
```json
{}
```

**Example Response:**
```json
{
  "scenario_id": "SCN-SAKTHI-FEST-2026-01",
  "disclaimer": "SYNTHETIC DEMO ESTIMATE ONLY - Deterministic Simulation",
  "initial_fleet_count": 16,
  "net_comparison": {
    "system_additional_passengers_boarded": 630,
    "system_unmet_demand_reduction": 630,
    "main_hub_peak_queue_reduction": 450,
    "source_stop_peak_queue_increase": 29,
    "fleet_conservation_verified": true,
    "relocated_buses_count": 3,
    "notes": "Simulated metrics are purely synthetic estimates based on model rules. No real-world precision or performance guarantees are implied."
  },
  "fleet_audit": {
    "initial_fleet_count": 16,
    "final_fleet_count": 16,
    "inventory_conserved": true,
    "duplicate_buses_detected": false,
    "invented_buses_detected": false,
    "missing_buses_detected": false,
    "details": "Initial fleet: 16 vehicles. Final fleet: 16 vehicles. Moved vehicles: 3. Inventory conservation: PASSED."
  }
}
```

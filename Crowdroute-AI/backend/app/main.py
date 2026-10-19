"""FastAPI Application for CrowdRoute AI.
Provides RESTful APIs for scenario retrieval, demand forecasting,
historical data ingestion, live status checks, fixed-fleet constrained reallocation,
side-by-side schedule simulation, and serves the interactive dashboard.
"""

import json
import logging
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

# Ensure backend directory is in sys.path
_backend_dir = Path(__file__).resolve().parent.parent
if str(_backend_dir) not in sys.path:
    sys.path.insert(0, str(_backend_dir))

from fastapi import FastAPI, File, Form, HTTPException, Response, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles

from app.models import (
    AllocateRequest,
    AllocateResponse,
    ComplaintCreate,
    ComplaintPublicItem,
    ComplaintResponse,
    ForecastRequest,
    ForecastResponse,
    HistoricalUploadResponse,
    LiveDataSummaryResponse,
    LiveWeatherResponse,
    ScenarioData,
    SimulateRequest,
    SimulateResponse,
    UserDataValidationResult,
)
from app.complaints import (
    get_complaint,
    list_public_complaints,
    save_complaint,
)
from app.forecast import generate_demand_forecast, load_default_scenario
from app.allocator import allocate_fixed_fleet
from app.simulator import compare_schedules
from app.historical import (
    generate_sample_historical_csv,
    generate_sample_historical_excel,
    parse_and_validate_historical_file,
)
from app.live_data import get_live_data_summary
from app.weather import get_live_weather

# Configure structured logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("crowdroute_ai")

app = FastAPI(
    title="CrowdRoute AI - Dynamic Festival Crowd Prediction and Fixed-Fleet Bus Optimization",
    description=(
        "Backend API for SAKTHI HACKFEST'26. "
        "Provides dynamic crowd demand forecasting responding to user and historical data, "
        "and fixed-fleet redistribution trade-off analysis under strict fleet conservation constraints.\n\n"
        "DISCLAIMER: All outputs are planning estimates and must NOT be used "
        "for direct real-world vehicle dispatch or life-critical passenger safety operations."
    ),
    version="1.1.0",
)

# Enable CORS for dashboard integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["System"])
@app.get("/api/health", tags=["System"])
def health_check() -> Dict[str, Any]:
    """Returns service health status, supported modes, and domain metadata."""
    return {
        "status": "healthy",
        "service": "CrowdRoute AI",
        "version": "1.1.0",
        "hackathon": "SAKTHI HACKFEST'26",
        "domain": "Generative AI Domain - Festival Transit Management",
        "supported_modes": ["DEMO_SYNTHETIC", "USER_DATA"],
        "supported_data_sources": ["MANUAL_INPUT", "HISTORICAL_RECORDS", "LIVE_API", "SYNTHETIC_DEMO"],
        "disclaimer": "SYNTHETIC DEMO & PLANNING ENGINE ONLY. Never invent real-world physical measurements.",
    }



@app.get("/api/scenario", response_model=ScenarioData, tags=["Scenario"])
def get_scenario() -> ScenarioData:
    """Returns the baseline synthetic demonstration scenario (stops, travel matrix, fleet)."""
    try:
        scenario = load_default_scenario()
        return scenario
    except Exception as exc:
        logger.error(f"Error loading demo scenario: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to load synthetic scenario: {str(exc)}",
        )


@app.post("/api/validate/scenario", response_model=UserDataValidationResult, tags=["Scenario"])
def validate_scenario(scenario: ScenarioData) -> UserDataValidationResult:
    """Validates user-defined scenario and checks field completeness for User Data Mode."""
    missing: List[str] = []
    errors: List[str] = []
    warnings: List[str] = []

    # Check attendance
    if scenario.festival_programme.expected_total_attendance <= 0:
        missing.append("expected_total_attendance (must be > 0 in user data mode)")

    # Check stops
    if not scenario.stops:
        missing.append("stops (at least one transit stop must be defined)")

    # Check fleet
    if not scenario.fleet:
        missing.append("fleet (at least one vehicle must be defined)")

    # Check demand distribution
    dist = scenario.festival_programme.demand_distribution
    if not dist:
        missing.append("demand_distribution (stop shares must be specified)")
    else:
        dist_sum = sum(dist.values())
        if abs(dist_sum - 1.0) > 0.05:
            warnings.append(f"Demand distribution shares sum to {dist_sum:.2f} instead of 1.00 (100%).")

    is_valid = len(missing) == 0 and len(errors) == 0

    return UserDataValidationResult(
        is_valid=is_valid,
        mode="USER_DATA",
        missing_fields=missing,
        validation_errors=errors,
        warnings=warnings,
        input_sources={
            "festival_programme": "USER_MANUAL",
            "stops": "USER_MANUAL",
            "fleet": "USER_MANUAL",
            "travel_matrix": "USER_MANUAL",
        },
    )


@app.post("/api/historical/upload", response_model=HistoricalUploadResponse, tags=["Historical Data"])
async def upload_historical_file(
    file: UploadFile = File(...),
    column_mapping: Optional[str] = Form(None),
) -> HistoricalUploadResponse:
    """Ingests and validates historical passenger boarding records from CSV or Excel (.xlsx)."""
    try:
        file_bytes = await file.read()
        custom_map = None
        if column_mapping:
            try:
                custom_map = json.loads(column_mapping)
            except Exception:
                pass

        result = parse_and_validate_historical_file(
            file_bytes=file_bytes,
            filename=file.filename or "uploaded_data.csv",
            custom_mapping=custom_map,
        )
        return result
    except Exception as exc:
        logger.error(f"Error parsing historical upload: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Historical file upload failed: {str(exc)}",
        )


@app.get("/api/historical/sample", tags=["Historical Data"])
def get_sample_historical_csv(format: Optional[str] = None) -> Response:
    """Provides a verified sample CSV or Excel representing previous festival passenger boarding counts."""
    if format and format.lower() in ("xlsx", "excel"):
        excel_bytes = generate_sample_historical_excel()
        return Response(
            content=excel_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": 'attachment; filename="sample_festival_historical_data.xlsx"'},
        )
    csv_text = generate_sample_historical_csv()
    return PlainTextResponse(
        content=csv_text,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="sample_festival_historical_data.csv"'},
    )


@app.get("/api/historical/sample.xlsx", tags=["Historical Data"])
def get_sample_historical_excel_direct() -> Response:
    """Provides a verified sample Excel (.xlsx) file representing previous festival passenger boarding counts."""
    excel_bytes = generate_sample_historical_excel()
    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="sample_festival_historical_data.xlsx"'},
    )


@app.get("/api/live/status", response_model=LiveDataSummaryResponse, tags=["Live Data"])
def get_live_status() -> LiveDataSummaryResponse:
    """Returns honest, uninvented status report for all external live feeds (weather, GTFS-RT)."""
    try:
        status_report = get_live_data_summary()
        return status_report
    except Exception as exc:
        logger.error(f"Error checking live status: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Live status check failed: {str(exc)}",
        )


@app.get("/api/weather/live", response_model=LiveWeatherResponse, tags=["Weather"])
def get_weather_endpoint(force_refresh: bool = False) -> LiveWeatherResponse:
    """Returns live ground meteorological telemetry from Open-Meteo for Tiruvannamalai venue."""
    try:
        return get_live_weather(force_refresh=force_refresh)
    except Exception as exc:
        logger.error(f"Error fetching live weather: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Live weather query failed: {str(exc)}",
        )


@app.post("/api/forecast", response_model=ForecastResponse, tags=["Forecasting"])
def post_forecast(request: ForecastRequest = ForecastRequest()) -> ForecastResponse:
    """Generates dynamic demand forecast responding to user parameters or historical records."""
    try:
        logger.info(
            f"Generating demand forecast [Mode: {request.operational_mode}, "
            f"Historical records: {len(request.historical_records or [])}]"
        )
        response = generate_demand_forecast(request)
        return response
    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(val_err),
        )
    except Exception as exc:
        logger.error(f"Forecasting error: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Forecasting failed: {str(exc)}",
        )


@app.post("/api/allocate", response_model=AllocateResponse, tags=["Optimization"])
def post_allocate(request: AllocateRequest = AllocateRequest()) -> AllocateResponse:
    """Evaluates candidate bus movements and returns safe reallocations under strict fleet conservation."""
    try:
        logger.info("Executing fixed-fleet allocation optimization")
        response = allocate_fixed_fleet(request)
        return response
    except Exception as exc:
        logger.error(f"Allocation error: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Allocation failed: {str(exc)}",
        )


@app.post("/api/simulate", response_model=SimulateResponse, tags=["Simulation"])
def post_simulate(request: SimulateRequest = SimulateRequest()) -> SimulateResponse:
    """Runs a side-by-side discrete interval simulation comparing baseline vs proposed allocations."""
    try:
        logger.info("Running comparative discrete simulation")
        response = compare_schedules(request)
        return response
    except Exception as exc:
        logger.error(f"Simulation error: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Simulation failed: {str(exc)}",
        )


# =====================================================================
# PUBLIC COMPLAINTS & GRIEVANCE REPORTING API
# =====================================================================

@app.post("/api/complaints", response_model=ComplaintResponse, status_code=status.HTTP_201_CREATED, tags=["Complaints"])
def create_complaint(complaint: ComplaintCreate) -> ComplaintResponse:
    """Submits a citizen transport complaint and persists it in SQLite storage."""
    try:
        logger.info(f"Submitting complaint for stop '{complaint.stop_id}', category: {complaint.category}")
        record = save_complaint(complaint)
        return record
    except Exception as exc:
        logger.error(f"Failed to record complaint: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to submit complaint: {str(exc)}",
        )


@app.get("/api/complaints", response_model=List[ComplaintPublicItem], tags=["Complaints"])
def get_complaints_list(limit: int = 50) -> List[ComplaintPublicItem]:
    """Returns recent public complaints with citizen phone and email strictly masked for privacy."""
    try:
        return list_public_complaints(limit=max(1, min(100, limit)))
    except Exception as exc:
        logger.error(f"Failed to list complaints: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve complaints: {str(exc)}",
        )


@app.get("/api/complaints/{reference_id}", response_model=ComplaintResponse, tags=["Complaints"])
def track_complaint(reference_id: str) -> ComplaintResponse:
    """Tracks a specific complaint status by its reference code (e.g. CR-2026-XXXX)."""
    record = get_complaint(reference_id)
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Complaint with reference ID '{reference_id}' was not found.",
        )
    return record


# =====================================================================
# DASHBOARD STATIC FILES MOUNT
# =====================================================================

STATIC_DIR = Path(__file__).resolve().parent / "static"
if not STATIC_DIR.exists():
    STATIC_DIR.mkdir(parents=True, exist_ok=True)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="frontend-assets")


@app.get("/", include_in_schema=False)
def serve_dashboard():
    """Serves the CrowdRoute AI React application if built, or direct link info."""
    dist_index = FRONTEND_DIST / "index.html"
    if dist_index.exists():
        return FileResponse(str(dist_index))
    return PlainTextResponse("CrowdRoute AI FastAPI backend is running. React + TypeScript frontend is active at http://localhost:5173")

"""Live Data Telemetry and External API Status Monitor for CrowdRoute AI.
Inspects external live data sources (live weather forecast, published GTFS-RT bus schedules).
Reports real, uninvented status: clearly shows when external feeds are unavailable or unconfigured.
NEVER invents fake live telemetry.
"""

import os
from datetime import datetime
from typing import Optional
import httpx

from app.models import LiveDataSourceStatus, LiveDataSummaryResponse


def check_live_weather_feed() -> LiveDataSourceStatus:
    """Checks the status of live regional weather forecast API.
    
    Only queries when LIVE_WEATHER_API_URL is explicitly configured.
    """
    api_url = os.environ.get("LIVE_WEATHER_API_URL")
    api_key = os.environ.get("WEATHER_API_KEY")

    if not api_url and not api_key:
        return LiveDataSourceStatus(
            source_name="Regional Live Weather Service",
            status="UNAVAILABLE",
            is_available=False,
            last_updated=None,
            message=(
                "No live weather API endpoint configured (set LIVE_WEATHER_API_URL in environment). "
                "Operating on user-specified scenario weather parameters without external live feed."
            ),
            data=None,
        )

    # Attempt query to configured live weather endpoint
    target_url = api_url or f"https://api.weatherapi.com/v1/current.json?key={api_key}&q=auto:ip"
    try:
        with httpx.Client(timeout=3.0) as client:
            resp = client.get(target_url)
            if resp.status_code == 200:
                data = resp.json()
                return LiveDataSourceStatus(
                    source_name="Regional Live Weather Service",
                    status="ONLINE",
                    is_available=True,
                    last_updated=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    message="Live meteorological feed active and synchronized.",
                    data={"http_status": 200, "payload": data},
                )
            else:
                return LiveDataSourceStatus(
                    source_name="Regional Live Weather Service",
                    status="STALE",
                    is_available=False,
                    last_updated=None,
                    message=f"Live weather service returned HTTP {resp.status_code}.",
                    data=None,
                )
    except Exception as exc:
        return LiveDataSourceStatus(
            source_name="Regional Live Weather Service",
            status="OFFLINE",
            is_available=False,
            last_updated=None,
            message=f"Unable to connect to live weather service: {str(exc)}",
            data=None,
        )


def check_live_transit_feed() -> LiveDataSourceStatus:
    """Checks the status of live municipal transit AVL / GTFS-Realtime schedule feed."""
    feed_url = os.environ.get("GTFS_REALTIME_FEED_URL")

    if not feed_url:
        return LiveDataSourceStatus(
            source_name="Published Bus GTFS-Realtime Telemetry",
            status="UNAVAILABLE",
            is_available=False,
            last_updated=None,
            message=(
                "No municipal AVL / GTFS-RT endpoint configured (set GTFS_REALTIME_FEED_URL). "
                "Fleet operational status sourced directly from scenario inventory."
            ),
            data=None,
        )

    try:
        with httpx.Client(timeout=3.0) as client:
            resp = client.get(feed_url)
            if resp.status_code == 200:
                return LiveDataSourceStatus(
                    source_name="Published Bus GTFS-Realtime Telemetry",
                    status="ONLINE",
                    is_available=True,
                    last_updated=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    message="Live municipal transit telemetry feed synchronized.",
                    data={"http_status": 200},
                )
            else:
                return LiveDataSourceStatus(
                    source_name="Published Bus GTFS-Realtime Telemetry",
                    status="STALE",
                    is_available=False,
                    last_updated=None,
                    message=f"GTFS-RT feed returned HTTP {resp.status_code}.",
                    data=None,
                )
    except Exception as exc:
        return LiveDataSourceStatus(
            source_name="Published Bus GTFS-Realtime Telemetry",
            status="OFFLINE",
            is_available=False,
            last_updated=None,
            message=f"Unable to connect to live transit AVL feed: {str(exc)}",
            data=None,
        )


def get_live_data_summary() -> LiveDataSummaryResponse:
    """Returns honest, uninvented status report for all external live feeds."""
    weather_status = check_live_weather_feed()
    transit_status = check_live_transit_feed()

    if weather_status.is_available and transit_status.is_available:
        overall = "FULLY_SYNCHRONIZED: Live weather and transit streams online."
    elif weather_status.is_available or transit_status.is_available:
        overall = "PARTIAL_SYNCHRONIZATION: One live stream online, remaining feeds offline."
    else:
        overall = "STANDALONE_DETERMINISTIC_MODE: No live external APIs configured; system operates on user and historical data."

    return LiveDataSummaryResponse(
        timestamp=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        weather_feed=weather_status,
        bus_schedule_feed=transit_status,
        overall_status=overall,
    )

"""Live Weather Service for CrowdRoute AI.
Integrates Open-Meteo API for real-time meteorological observations in Tiruvannamalai.
Includes in-memory caching (10 min TTL), graceful error handling, and WMO weather code mapping.
Respects provider usage policy with zero API secrets required.
"""

from datetime import datetime
import logging
from typing import Any, Dict, Optional, Tuple
import httpx

from app.models import LiveWeatherResponse

logger = logging.getLogger("crowdroute_ai.weather")

TIRUVANNAMALAI_LAT = 12.2253
TIRUVANNAMALAI_LON = 79.0747
OPEN_METEO_URL = (
    "https://api.open-meteo.com/v1/forecast"
    f"?latitude={TIRUVANNAMALAI_LAT}&longitude={TIRUVANNAMALAI_LON}"
    "&current=temperature_2m,relative_humidity_2m,precipitation,rain,weather_code,wind_speed_10m"
    "&timezone=Asia%2FKolkata"
)

# In-memory cache
_weather_cache: Optional[Dict[str, Any]] = None
_cache_timestamp: Optional[datetime] = None
CACHE_TTL_SECONDS = 600  # 10 minutes


def map_wmo_code(code: int) -> Tuple[str, str]:
    """Maps WMO Weather Code to CrowdRoute AI condition and descriptive label.
    
    WMO codes:
    0: Clear sky
    1-3: Mainly clear, partly cloudy, overcast
    45, 48: Fog
    51-55: Drizzle
    61-65: Rain (slight, moderate, heavy)
    80-82: Rain showers
    95-99: Thunderstorm
    """
    if code == 0:
        return "clear", "Clear Skies"
    elif code in (1, 2, 3):
        return "cloudy", "Partly Cloudy / Overcast"
    elif code in (45, 48):
        return "cloudy", "Misty / Foggy"
    elif code in (51, 53, 55, 61):
        return "light_rain", "Passing Light Drizzle"
    elif code in (63, 65, 80, 81):
        return "rainy", "Moderate Continuous Rain"
    elif code in (66, 67, 82, 95, 96, 99):
        return "heavy_rain", "Heavy Monsoon Rain / Thunderstorm"
    else:
        return "cloudy", f"Variable Weather (WMO {code})"


def get_live_weather(force_refresh: bool = False) -> LiveWeatherResponse:
    """Fetches real-time weather observations for Tiruvannamalai with caching."""
    global _weather_cache, _cache_timestamp

    now = datetime.now()
    now_str = now.strftime("%Y-%m-%d %H:%M:%S IST")

    # Check cache if not forcing refresh
    if not force_refresh and _weather_cache and _cache_timestamp:
        age_seconds = (now - _cache_timestamp).total_seconds()
        if age_seconds < CACHE_TTL_SECONDS:
            cached_data = _weather_cache
            cond, desc = map_wmo_code(cached_data.get("weather_code", 0))
            return LiveWeatherResponse(
                status="CACHED",
                source="Open-Meteo Weather API (Cached)",
                condition=cond,  # type: ignore
                condition_description=desc,
                temperature_c=cached_data.get("temperature_2m"),
                relative_humidity_pct=cached_data.get("relative_humidity_2m"),
                precipitation_mm=cached_data.get("precipitation"),
                rain_mm=cached_data.get("rain"),
                wind_speed_kmh=cached_data.get("wind_speed_10m"),
                observation_time=cached_data.get("time"),
                last_updated=_cache_timestamp.strftime("%Y-%m-%d %H:%M:%S IST"),
                latitude=TIRUVANNAMALAI_LAT,
                longitude=TIRUVANNAMALAI_LON,
                timezone="Asia/Kolkata",
                message=f"Serving cached observation ({int(age_seconds)}s old). Upstream rate-limit friendly.",
                is_live=False,
            )

    try:
        with httpx.Client(timeout=4.0) as client:
            resp = client.get(OPEN_METEO_URL)
            if resp.status_code == 200:
                data = resp.json()
                current = data.get("current", {})
                w_code = current.get("weather_code", 0)
                cond, desc = map_wmo_code(w_code)

                _weather_cache = current
                _cache_timestamp = now

                return LiveWeatherResponse(
                    status="LIVE",
                    source="Open-Meteo Weather API (Live Observation)",
                    condition=cond,  # type: ignore
                    condition_description=desc,
                    temperature_c=current.get("temperature_2m"),
                    relative_humidity_pct=current.get("relative_humidity_2m"),
                    precipitation_mm=current.get("precipitation"),
                    rain_mm=current.get("rain"),
                    wind_speed_kmh=current.get("wind_speed_10m"),
                    observation_time=current.get("time"),
                    last_updated=now_str,
                    latitude=TIRUVANNAMALAI_LAT,
                    longitude=TIRUVANNAMALAI_LON,
                    timezone="Asia/Kolkata",
                    message="Live meteorological feed active from Open-Meteo ground telemetry.",
                    is_live=True,
                )
            else:
                logger.warning(f"Open-Meteo returned status {resp.status_code}")
                # Fall back to cache if available
                if _weather_cache and _cache_timestamp:
                    cond, desc = map_wmo_code(_weather_cache.get("weather_code", 0))
                    return LiveWeatherResponse(
                        status="CACHED",
                        source="Open-Meteo Weather API (Fallback Cache)",
                        condition=cond,  # type: ignore
                        condition_description=desc,
                        temperature_c=_weather_cache.get("temperature_2m"),
                        relative_humidity_pct=_weather_cache.get("relative_humidity_2m"),
                        precipitation_mm=_weather_cache.get("precipitation"),
                        rain_mm=_weather_cache.get("rain"),
                        wind_speed_kmh=_weather_cache.get("wind_speed_10m"),
                        observation_time=_weather_cache.get("time"),
                        last_updated=_cache_timestamp.strftime("%Y-%m-%d %H:%M:%S IST"),
                        latitude=TIRUVANNAMALAI_LAT,
                        longitude=TIRUVANNAMALAI_LON,
                        timezone="Asia/Kolkata",
                        message=f"Upstream returned HTTP {resp.status_code}; using cached telemetry.",
                        is_live=False,
                    )
                return LiveWeatherResponse(
                    status="UNAVAILABLE",
                    source="Open-Meteo Weather API",
                    condition="clear",
                    condition_description="Clear (Default Scenario)",
                    temperature_c=25.0,
                    relative_humidity_pct=70,
                    precipitation_mm=0.0,
                    rain_mm=0.0,
                    wind_speed_kmh=5.0,
                    observation_time=None,
                    last_updated=now_str,
                    latitude=TIRUVANNAMALAI_LAT,
                    longitude=TIRUVANNAMALAI_LON,
                    timezone="Asia/Kolkata",
                    message=f"Live weather service returned HTTP {resp.status_code}. Using manual scenario inputs.",
                    is_live=False,
                )
    except Exception as exc:
        logger.warning(f"Failed to fetch live weather: {exc}")
        if _weather_cache and _cache_timestamp:
            cond, desc = map_wmo_code(_weather_cache.get("weather_code", 0))
            return LiveWeatherResponse(
                status="CACHED",
                source="Open-Meteo Weather API (Fallback Cache)",
                condition=cond,  # type: ignore
                condition_description=desc,
                temperature_c=_weather_cache.get("temperature_2m"),
                relative_humidity_pct=_weather_cache.get("relative_humidity_2m"),
                precipitation_mm=_weather_cache.get("precipitation"),
                rain_mm=_weather_cache.get("rain"),
                wind_speed_kmh=_weather_cache.get("wind_speed_10m"),
                observation_time=_weather_cache.get("time"),
                last_updated=_cache_timestamp.strftime("%Y-%m-%d %H:%M:%S IST"),
                latitude=TIRUVANNAMALAI_LAT,
                longitude=TIRUVANNAMALAI_LON,
                timezone="Asia/Kolkata",
                message=f"Network unreachable: {str(exc)}. Serving last valid cache.",
                is_live=False,
            )
        return LiveWeatherResponse(
            status="UNAVAILABLE",
            source="Open-Meteo Weather API",
            condition="clear",
            condition_description="Clear (Default Scenario)",
            temperature_c=25.0,
            relative_humidity_pct=70,
            precipitation_mm=0.0,
            rain_mm=0.0,
            wind_speed_kmh=5.0,
            observation_time=None,
            last_updated=now_str,
            latitude=TIRUVANNAMALAI_LAT,
            longitude=TIRUVANNAMALAI_LON,
            timezone="Asia/Kolkata",
            message=f"Unable to reach live weather feed: {str(exc)}. Operating on manual scenario.",
            is_live=False,
        )

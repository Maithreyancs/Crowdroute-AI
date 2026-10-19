"""Tests for Live Weather Open-Meteo Integration and Extended Festival Scenario Inputs."""

from fastapi.testclient import TestClient
from app.main import app
from app.weather import map_wmo_code, get_live_weather
from app.models import ScenarioData, FestivalProgramme, TimeHorizon, Stop, Bus, WeatherScenario, ScenarioMetadata

client = TestClient(app)


def test_wmo_code_mapping():
    assert map_wmo_code(0) == ("clear", "Clear Skies")
    assert map_wmo_code(2)[0] == "cloudy"
    assert map_wmo_code(61)[0] == "light_rain"
    assert map_wmo_code(63)[0] == "rainy"
    assert map_wmo_code(95)[0] == "heavy_rain"


def test_get_live_weather_service():
    weather = get_live_weather(force_refresh=False)
    assert weather.status in ("LIVE", "CACHED", "UNAVAILABLE")
    assert weather.condition in ("clear", "cloudy", "light_rain", "rainy", "heavy_rain")
    assert weather.timezone == "Asia/Kolkata"
    assert weather.latitude == 12.2253
    assert weather.longitude == 79.0747


def test_api_weather_live_endpoint():
    response = client.get("/api/weather/live")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "condition" in data
    assert "temperature_c" in data
    assert "last_updated" in data
    assert data["timezone"] == "Asia/Kolkata"


def test_scenario_extended_fields_backward_compatibility():
    response = client.get("/api/scenario")
    assert response.status_code == 200
    data = response.json()
    prog = data["festival_programme"]
    assert "event_start_time" in prog
    assert "event_date" in prog
    assert "event_delay_minutes" in prog
    assert "timezone" in prog
    assert prog["expected_total_attendance"] > 0

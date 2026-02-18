"""Weather endpoint: proxy to OpenWeatherMap or return mock data."""

import logging

import httpx
from fastapi import APIRouter, Query

from app.core.config import get_settings

router = APIRouter(prefix="/weather", tags=["weather"])
logger = logging.getLogger(__name__)

# AQI index (1-5) to Korean label mapping
_AQI_LABELS = {1: "좋음", 2: "보통", 3: "나쁨", 4: "매우 나쁨", 5: "위험"}

# Seoul defaults for mock data
_MOCK_WEATHER = {
    "temp": 12.5,
    "feels_like": 10.2,
    "humidity": 65,
    "wind_speed": 3.2,
    "description": "맑음",
    "icon": "01d",
    "aqi": 2,
    "aqi_label": "보통",
}

# Map OpenWeatherMap condition codes to Korean descriptions
_DESCRIPTION_KR: dict[str, str] = {
    "clear sky": "맑음",
    "few clouds": "구름 조금",
    "scattered clouds": "구름 낌",
    "broken clouds": "흐림",
    "overcast clouds": "흐림",
    "shower rain": "소나기",
    "rain": "비",
    "light rain": "가벼운 비",
    "moderate rain": "비",
    "heavy intensity rain": "강한 비",
    "thunderstorm": "천둥번개",
    "snow": "눈",
    "light snow": "가벼운 눈",
    "mist": "안개",
    "haze": "연무",
    "fog": "안개",
}


@router.get("/current")
async def get_current_weather(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
) -> dict:
    """Return current weather for the given coordinates.

    If OPENWEATHER_API_KEY is configured, fetches real data from
    OpenWeatherMap Current Weather API. Otherwise returns Seoul-based
    mock data so the frontend can develop without a key.
    """
    settings = get_settings()
    api_key = settings.OPENWEATHER_API_KEY

    if not api_key:
        logger.debug("No OPENWEATHER_API_KEY set; returning mock weather data")
        return _MOCK_WEATHER

    return await _fetch_openweather(lat, lng, api_key)


async def _fetch_openweather(lat: float, lng: float, api_key: str) -> dict:
    """Call OpenWeatherMap Current Weather and Air Pollution APIs and normalise the response."""
    weather_url = "https://api.openweathermap.org/data/2.5/weather"
    weather_params = {
        "lat": lat,
        "lon": lng,
        "appid": api_key,
        "units": "metric",
        "lang": "kr",
    }

    air_url = "http://api.openweathermap.org/data/2.5/air_pollution"
    air_params = {
        "lat": lat,
        "lon": lng,
        "appid": api_key,
    }

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            weather_response = await client.get(weather_url, params=weather_params)
            weather_response.raise_for_status()
            data = weather_response.json()

            # Fetch air quality data (non-critical; failures are tolerated)
            aqi: int | None = None
            try:
                air_response = await client.get(air_url, params=air_params)
                air_response.raise_for_status()
                air_data = air_response.json()
                air_list = air_data.get("list", [])
                if air_list:
                    aqi = air_list[0].get("main", {}).get("aqi")
            except httpx.HTTPError:
                logger.warning(
                    "OpenWeatherMap Air Pollution API request failed; omitting AQI",
                    exc_info=True,
                )

        main = data.get("main", {})
        wind = data.get("wind", {})
        weather_list = data.get("weather", [{}])
        weather_info = weather_list[0] if weather_list else {}

        description_en = weather_info.get("description", "")
        description_kr = _DESCRIPTION_KR.get(description_en, weather_info.get("description", ""))

        result = {
            "temp": round(main.get("temp", 0), 1),
            "feels_like": round(main.get("feels_like", 0), 1),
            "humidity": main.get("humidity", 0),
            "wind_speed": round(wind.get("speed", 0), 1),
            "description": description_kr,
            "icon": weather_info.get("icon", "01d"),
            "aqi": aqi,
            "aqi_label": _AQI_LABELS.get(aqi) if aqi is not None else None,
        }

        return result

    except httpx.HTTPError:
        logger.warning("OpenWeatherMap API request failed; returning mock data", exc_info=True)
        return _MOCK_WEATHER

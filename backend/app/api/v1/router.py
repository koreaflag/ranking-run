"""V1 API router: aggregates all route modules under /api/v1."""

from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.courses import router as courses_router
from app.api.v1.events import router as events_router
from app.api.v1.favorites import router as favorites_router
from app.api.v1.follows import router as follows_router
from app.api.v1.gear import router as gear_router
from app.api.v1.gear import public_router as gear_public_router
from app.api.v1.heatmap import router as heatmap_router
from app.api.v1.imports import router as imports_router
from app.api.v1.likes import router as likes_router
from app.api.v1.notifications import router as notifications_router
from app.api.v1.rankings import router as rankings_router
from app.api.v1.reviews import router as reviews_router
from app.api.v1.runs import router as runs_router
from app.api.v1.uploads import router as uploads_router
from app.api.v1.users import router as users_router
from app.api.v1.strava import router as strava_router
from app.api.v1.weather import router as weather_router

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(auth_router)
api_router.include_router(users_router)
api_router.include_router(follows_router)
api_router.include_router(courses_router)
api_router.include_router(runs_router)
api_router.include_router(rankings_router)
api_router.include_router(reviews_router)
api_router.include_router(likes_router)
api_router.include_router(events_router)
api_router.include_router(favorites_router)
api_router.include_router(imports_router)
api_router.include_router(uploads_router)
api_router.include_router(weather_router)
api_router.include_router(heatmap_router)
api_router.include_router(gear_router)
api_router.include_router(gear_public_router)
api_router.include_router(notifications_router)
api_router.include_router(strava_router)

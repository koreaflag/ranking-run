"""V1 API router: aggregates all route modules under /api/v1.

Rate limiting is configured at the application level via slowapi in app/main.py
and app/core/rate_limit.py. Individual endpoint rate limits can be applied using
the @limiter.limit() decorator from app.core.rate_limit on write endpoints
(e.g., course creation, run completion, crew creation).
"""

from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.community import router as community_router
from app.api.v1.contacts import router as contacts_router
from app.api.v1.courses import router as courses_router
from app.api.v1.crew_chat import router as crew_chat_router
from app.api.v1.crews import router as crews_router
from app.api.v1.events import router as events_router
from app.api.v1.favorites import router as favorites_router
from app.api.v1.follows import router as follows_router
from app.api.v1.friends import router as friends_router
from app.api.v1.gear import router as gear_router
from app.api.v1.gear import public_router as gear_public_router
from app.api.v1.heatmap import router as heatmap_router
from app.api.v1.imports import router as imports_router
from app.api.v1.leaderboard import router as leaderboard_router
from app.api.v1.likes import router as likes_router
from app.api.v1.notifications import router as notifications_router
from app.api.v1.rankings import router as rankings_router
from app.api.v1.reviews import router as reviews_router
from app.api.v1.runs import router as runs_router
from app.api.v1.uploads import router as uploads_router
from app.api.v1.users import router as users_router
from app.api.v1.announcements import router as announcements_router
from app.api.v1.crew_join_requests import router as crew_join_requests_router
from app.api.v1.group_runs import router as group_runs_router
from app.api.v1.live_group_runs import router as live_group_runs_router
from app.api.v1.crew_challenges import router as crew_challenges_router
from app.api.v1.challenges import router as challenges_router
from app.api.v1.strava import router as strava_router
from app.api.v1.weather import router as weather_router

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(auth_router)
api_router.include_router(users_router)
api_router.include_router(community_router)
api_router.include_router(contacts_router)
api_router.include_router(crew_chat_router)
api_router.include_router(crews_router)
api_router.include_router(follows_router)
api_router.include_router(friends_router)
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
api_router.include_router(announcements_router)
api_router.include_router(crew_join_requests_router)
api_router.include_router(group_runs_router)
api_router.include_router(live_group_runs_router)
api_router.include_router(crew_challenges_router)
api_router.include_router(challenges_router)
api_router.include_router(strava_router)
api_router.include_router(leaderboard_router)

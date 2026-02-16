"""V1 API router: aggregates all route modules under /api/v1."""

from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.courses import router as courses_router
from app.api.v1.rankings import router as rankings_router
from app.api.v1.runs import router as runs_router
from app.api.v1.uploads import router as uploads_router
from app.api.v1.users import router as users_router

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(auth_router)
api_router.include_router(users_router)
api_router.include_router(courses_router)
api_router.include_router(runs_router)
api_router.include_router(rankings_router)
api_router.include_router(uploads_router)

"""FastAPI application entry point."""

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.container import Container
from app.core.exceptions import AppError
from app.core.logging_config import setup_logging
from app.core.rate_limit import limiter
from app.core.sentry import init_sentry

settings = get_settings()

# Configure logging and error tracking
setup_logging(debug=settings.DEBUG, json_logs=settings.JSON_LOGS)
init_sentry(dsn=settings.SENTRY_DSN, environment=settings.APP_ENV)
logger = logging.getLogger(__name__)

# DI container
container = Container()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle manager."""
    logger.info("Starting %s (%s)", settings.APP_NAME, settings.APP_ENV)

    upload_dir = Path(settings.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)
    (upload_dir / "avatars").mkdir(parents=True, exist_ok=True)

    yield

    logger.info("Shutting down %s", settings.APP_NAME)
    from app.db.session import engine
    await engine.dispose()


app = FastAPI(
    title=settings.APP_NAME,
    description="RunCrew running app backend API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
)

# Rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files for local uploads
upload_dir = Path(settings.UPLOAD_DIR)
if upload_dir.exists():
    app.mount("/uploads", StaticFiles(directory=str(upload_dir)), name="uploads")

# Include API routes
app.include_router(api_router)


# ---------------------------------------------------------------------------
# Global exception handlers
# ---------------------------------------------------------------------------

@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    """Catch all AppError subclasses and return a uniform JSON response."""
    headers = None
    if exc.status_code == 401:
        headers = {"WWW-Authenticate": "Bearer"}
    return JSONResponse(
        status_code=exc.status_code,
        content={"code": exc.code, "message": exc.message},
        headers=headers,
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Fallback handler for truly unexpected errors."""
    logger.exception("Unhandled exception: %s", str(exc))
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "code": "INTERNAL_ERROR",
            "message": "An unexpected error occurred",
        },
    )


@app.get("/health")
async def health_check() -> dict:
    """Health check endpoint for monitoring and load balancers."""
    return {"status": "ok", "app": settings.APP_NAME, "env": settings.APP_ENV}

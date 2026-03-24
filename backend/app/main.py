"""FastAPI application entry point."""

import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api.v1.router import api_router
from app.api.v1.ws import ws_router
from app.core.config import get_settings
from app.core.container import Container
from app.core.error_handler import install_error_handlers
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


async def _cleanup_expired_tokens():
    """Periodically delete expired/revoked refresh tokens (every 6 hours)."""
    from app.db.session import async_session_factory
    from sqlalchemy import delete
    from app.models.user import RefreshToken

    while True:
        await asyncio.sleep(6 * 3600)  # 6 hours
        try:
            async with async_session_factory() as session:
                result = await session.execute(
                    delete(RefreshToken).where(
                        (RefreshToken.expires_at < datetime.now(timezone.utc))
                        | (RefreshToken.is_revoked == True)  # noqa: E712
                    )
                )
                await session.commit()
                if result.rowcount:
                    logger.info("Cleaned up %d expired/revoked refresh tokens", result.rowcount)
        except Exception:
            logger.exception("Token cleanup failed")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle manager."""
    logger.info("Starting %s (%s)", settings.APP_NAME, settings.APP_ENV)

    upload_dir = Path(settings.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)
    (upload_dir / "avatars").mkdir(parents=True, exist_ok=True)

    cleanup_task = asyncio.create_task(_cleanup_expired_tokens())

    yield

    cleanup_task.cancel()
    logger.info("Shutting down %s", settings.APP_NAME)
    from app.db.session import engine
    await engine.dispose()


app = FastAPI(
    title=settings.APP_NAME,
    description="RUNVS running app backend API",
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

# Include WebSocket routes (outside /api/v1 prefix since ws_router defines its own path)
app.include_router(ws_router)

# Install global exception handlers (AppError + unhandled → DB error logging)
install_error_handlers(app)


@app.get("/health")
async def health_check() -> dict:
    """Health check endpoint for monitoring and load balancers."""
    return {"status": "ok", "app": settings.APP_NAME, "env": settings.APP_ENV}

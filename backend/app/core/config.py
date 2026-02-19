"""Application configuration using pydantic-settings."""

from functools import lru_cache
from typing import List

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Application
    APP_NAME: str = "RunCrew"
    APP_ENV: str = "development"
    DEBUG: bool = True

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://runcrew:runcrew_password@localhost:5432/runcrew"
    DATABASE_ECHO: bool = False

    # JWT
    JWT_SECRET_KEY: str = "your-super-secret-key-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # Kakao OAuth
    KAKAO_CLIENT_ID: str = ""

    # Apple Sign In
    APPLE_BUNDLE_ID: str = "app.runcrew"
    APPLE_TEAM_ID: str = ""

    # Google OAuth
    GOOGLE_CLIENT_ID: str = ""

    # Naver OAuth
    NAVER_CLIENT_ID: str = ""
    NAVER_CLIENT_SECRET: str = ""

    # Strava OAuth
    STRAVA_CLIENT_ID: str = ""
    STRAVA_CLIENT_SECRET: str = ""
    STRAVA_REDIRECT_URI: str = ""

    # OpenWeatherMap
    OPENWEATHER_API_KEY: str = ""

    # Mapbox
    MAPBOX_ACCESS_TOKEN: str = ""

    # File Upload
    UPLOAD_DIR: str = "./uploads"
    MAX_UPLOAD_SIZE_MB: int = 5

    # S3 Storage (optional - falls back to local if not configured)
    S3_BUCKET_NAME: str = ""
    S3_REGION: str = "ap-northeast-2"
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    CDN_BASE_URL: str = ""  # e.g. https://cdn.runcrew.app

    # Firebase Cloud Messaging
    FCM_SERVICE_ACCOUNT_PATH: str = ""  # Path to Firebase service account JSON

    # Sentry
    SENTRY_DSN: str = ""

    # Logging
    JSON_LOGS: bool = False  # True in production for structured logging

    # CORS
    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:8081"]

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: str | List[str]) -> List[str]:
        if isinstance(v, str):
            import json
            return json.loads(v)
        return v

    @property
    def max_upload_size_bytes(self) -> int:
        return self.MAX_UPLOAD_SIZE_MB * 1024 * 1024


@lru_cache()
def get_settings() -> Settings:
    return Settings()

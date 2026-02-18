"""StravaConnection model: stores Strava OAuth tokens per user."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDPrimaryKeyMixin


class StravaConnection(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "strava_connections"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        unique=True,
        nullable=False,
    )
    strava_athlete_id: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )
    athlete_name: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )
    athlete_profile_url: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    access_token: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )
    refresh_token: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )
    token_expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    auto_sync: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        server_default="false",
    )
    last_sync_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

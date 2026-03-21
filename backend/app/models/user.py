"""User, SocialAccount, and RefreshToken models."""

import secrets
import string
import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    BigInteger,
    String,
    Text,
    UniqueConstraint,
    Index,
    event,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class User(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("total_distance_meters >= 0", name="ck_user_distance_non_negative"),
        CheckConstraint("total_runs >= 0", name="ck_user_runs_non_negative"),
        CheckConstraint("total_points >= 0", name="ck_user_points_non_negative"),
    )

    user_code: Mapped[str] = mapped_column(String(8), unique=True, index=True, nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    nickname: Mapped[str | None] = mapped_column(String(12), nullable=True, unique=True)
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    birthday: Mapped[date | None] = mapped_column(Date, nullable=True)
    height_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    bio: Mapped[str | None] = mapped_column(String(100), nullable=True)
    crew_name: Mapped[str | None] = mapped_column(String(50), nullable=True)
    instagram_username: Mapped[str | None] = mapped_column(String(30), nullable=True)
    activity_region: Mapped[str | None] = mapped_column(String(100), nullable=True)
    country: Mapped[str | None] = mapped_column(String(50), nullable=True)
    phone_number_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True, index=True)
    consent_terms_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    consent_privacy_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    consent_location_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    consent_contacts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    consent_marketing_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    total_distance_meters: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0")
    total_runs: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    total_points: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0")
    runner_level: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    weekly_goal_km: Mapped[float] = mapped_column(Float, default=20.0, server_default="20.0", nullable=False)

    # Ban
    is_banned: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    banned_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    banned_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    social_accounts: Mapped[list["SocialAccount"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    refresh_tokens: Mapped[list["RefreshToken"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        lazy="noload",
    )
    gear_items: Mapped[list["UserGear"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        lazy="noload",
    )


_USER_CODE_ALPHABET = string.ascii_uppercase + string.digits


def _generate_user_code() -> str:
    """Generate a random 8-character alphanumeric (uppercase) user code."""
    return "".join(secrets.choice(_USER_CODE_ALPHABET) for _ in range(8))


@event.listens_for(User, "init")
def _set_default_user_code(target: User, _args: tuple, _kwargs: dict) -> None:
    """Auto-assign a user_code when a new User instance is created."""
    if not target.user_code:
        target.user_code = _generate_user_code()


class SocialAccount(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "social_accounts"
    __table_args__ = (
        UniqueConstraint("provider", "provider_id", name="idx_social_provider"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    provider: Mapped[str] = mapped_column(String(20), nullable=False)
    provider_id: Mapped[str] = mapped_column(String(255), nullable=False)
    provider_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    user: Mapped["User"] = relationship(back_populates="social_accounts")


class RefreshToken(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "refresh_tokens"
    __table_args__ = (
        Index("idx_refresh_user", "user_id", "is_revoked"),
        Index("idx_refresh_token_hash", "token_hash"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    token_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    is_revoked: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=None,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    user: Mapped["User"] = relationship(back_populates="refresh_tokens")

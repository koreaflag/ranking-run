"""Event and EventParticipant models for challenges and races."""

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Index,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Event(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "events"
    __table_args__ = (
        Index("idx_events_active_dates", "is_active", "starts_at", "ends_at"),
    )

    title: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    event_type: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="challenge"
    )

    # Target course (nullable for distance-only challenges)
    course_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("courses.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Period
    starts_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    ends_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    # Goals (for challenge-type events)
    target_distance_meters: Mapped[int | None] = mapped_column(Integer, nullable=True)
    target_runs: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Map display
    badge_color: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="'#FF5252'"
    )
    badge_icon: Mapped[str] = mapped_column(
        String(30), nullable=False, server_default="'trophy'"
    )

    # Participation
    max_participants: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true"
    )

    # Location for map markers (for events without a course)
    center_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    center_lng: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Relationships
    course: Mapped["Course | None"] = relationship("Course", lazy="joined")
    participants: Mapped[list["EventParticipant"]] = relationship(
        back_populates="event",
        cascade="all, delete-orphan",
        lazy="noload",
    )


class EventParticipant(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "event_participants"
    __table_args__ = (
        UniqueConstraint("event_id", "user_id", name="uq_event_participant"),
    )

    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    progress_distance_meters: Mapped[int] = mapped_column(
        Integer, default=0, server_default="0"
    )
    progress_runs: Mapped[int] = mapped_column(
        Integer, default=0, server_default="0"
    )
    completed: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false"
    )
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    event: Mapped["Event"] = relationship(back_populates="participants")
    user: Mapped["User"] = relationship("User", lazy="joined")

"""LiveGroupRun and LiveGroupRunParticipant models for real-time multi-user running."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDPrimaryKeyMixin


class LiveGroupRun(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "live_group_runs"
    __table_args__ = (
        Index("idx_live_group_runs_course_status", "course_id", "status"),
        Index("idx_live_group_runs_host", "host_user_id"),
    )

    course_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("courses.id", ondelete="CASCADE"),
        nullable=False,
    )
    host_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="waiting"
    )
    max_participants: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="10"
    )
    scheduled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    course: Mapped["Course"] = relationship("Course", lazy="noload")
    host: Mapped["User"] = relationship("User", lazy="joined")
    participants: Mapped[list["LiveGroupRunParticipant"]] = relationship(
        back_populates="live_group_run",
        cascade="all, delete-orphan",
        lazy="noload",
    )


class LiveGroupRunParticipant(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "live_group_run_participants"
    __table_args__ = (
        Index(
            "uq_live_group_run_participant",
            "live_group_run_id",
            "user_id",
            unique=True,
        ),
        Index("idx_live_group_run_participant_user", "user_id"),
    )

    live_group_run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("live_group_runs.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="joined"
    )
    current_distance_m: Mapped[float] = mapped_column(
        Float, nullable=False, server_default="0"
    )
    current_duration_s: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
    last_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    live_group_run: Mapped["LiveGroupRun"] = relationship(
        back_populates="participants"
    )
    user: Mapped["User"] = relationship("User", lazy="joined")

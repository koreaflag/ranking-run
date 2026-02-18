"""RunRecord model - finalized run record created after session completion."""

import uuid
from datetime import datetime

from geoalchemy2 import Geography
from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDPrimaryKeyMixin


class RunRecord(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "run_records"
    __table_args__ = (
        Index("idx_runs_user_finished", "user_id", "finished_at"),
        Index("idx_runs_course_duration", "course_id", "duration_seconds"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("run_sessions.id"),
        nullable=False,
    )
    course_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("courses.id", ondelete="SET NULL"),
        nullable=True,
    )

    distance_meters: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    total_elapsed_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    avg_pace_seconds_per_km: Mapped[int | None] = mapped_column(Integer, nullable=True)
    best_pace_seconds_per_km: Mapped[int | None] = mapped_column(Integer, nullable=True)
    avg_speed_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_speed_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    calories: Mapped[int | None] = mapped_column(Integer, nullable=True)
    elevation_gain_meters: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    elevation_loss_meters: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    # PostGIS geography column
    route_geometry = mapped_column(
        Geography(geometry_type="LINESTRING", srid=4326),
        nullable=True,
    )

    elevation_profile: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    splits: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    pause_intervals: Mapped[list | None] = mapped_column(JSONB, server_default="[]")
    filter_config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Course completion judgment
    course_completed: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    route_match_percent: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_deviation_meters: Mapped[float | None] = mapped_column(Float, nullable=True)

    # External import tracking
    source: Mapped[str] = mapped_column(
        String(20),
        default="app",
        server_default="app",
    )
    external_import_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("external_imports.id"),
        nullable=True,
    )

    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    finished_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    user: Mapped["User"] = relationship("User", lazy="joined")
    session: Mapped["RunSession"] = relationship("RunSession", lazy="noload")
    course: Mapped["Course | None"] = relationship("Course", lazy="joined")

"""Course and CourseStats models with PostGIS geometry columns."""

import uuid
from datetime import datetime

from geoalchemy2 import Geography
from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    Float,
    Index,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Course(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "courses"
    __table_args__ = (
        Index("idx_courses_start_point", "start_point", postgresql_using="gist"),
        Index("idx_courses_public_created", "is_public", "created_at"),
        Index("idx_courses_creator", "creator_id"),
    )

    creator_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
    )
    run_record_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        nullable=True,
    )
    title: Mapped[str] = mapped_column(String(30), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # PostGIS geography columns
    route_geometry = mapped_column(
        Geography(geometry_type="LINESTRING", srid=4326),
        nullable=True,
    )
    raw_route_geometry = mapped_column(
        Geography(geometry_type="LINESTRING", srid=4326),
        nullable=True,
    )
    start_point = mapped_column(
        Geography(geometry_type="POINT", srid=4326),
        nullable=True,
    )

    distance_meters: Mapped[int] = mapped_column(Integer, nullable=False)
    estimated_duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    elevation_gain_meters: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    elevation_profile: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    thumbnail_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_public: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    tags: Mapped[list[str] | None] = mapped_column(ARRAY(Text), server_default="{}")
    difficulty: Mapped[str | None] = mapped_column(String(10), nullable=True, default=None)
    course_type: Mapped[str | None] = mapped_column(String(10), nullable=True, default=None)
    lap_count: Mapped[int | None] = mapped_column(Integer, nullable=True, default=None)

    # Relationships
    creator: Mapped["User"] = relationship("User", lazy="joined")
    stats: Mapped["CourseStats | None"] = relationship(
        back_populates="course",
        uselist=False,
        cascade="all, delete-orphan",
        lazy="joined",
    )


class CourseStats(Base):
    __tablename__ = "course_stats"

    course_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("courses.id", ondelete="CASCADE"),
        primary_key=True,
    )
    total_runs: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    unique_runners: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    avg_duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    avg_pace_seconds_per_km: Mapped[int | None] = mapped_column(Integer, nullable=True)
    best_duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    best_pace_seconds_per_km: Mapped[int | None] = mapped_column(Integer, nullable=True)
    completion_rate: Mapped[float] = mapped_column(Float, default=0.0, server_default="0")
    runs_by_hour: Mapped[dict | None] = mapped_column(JSONB, server_default="{}")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    course: Mapped["Course"] = relationship(back_populates="stats")

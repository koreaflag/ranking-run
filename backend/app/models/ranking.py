"""Ranking model for course leaderboards."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDPrimaryKeyMixin


class Ranking(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "rankings"
    __table_args__ = (
        UniqueConstraint("course_id", "user_id", name="idx_rankings_course_user"),
        Index("idx_rankings_course_duration", "course_id", "best_duration_seconds"),
    )

    course_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("courses.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
    )
    best_duration_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    best_pace_seconds_per_km: Mapped[int] = mapped_column(Integer, nullable=False)
    run_count: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    rank: Mapped[int | None] = mapped_column(Integer, nullable=True)
    achieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    user: Mapped["User"] = relationship("User", lazy="joined")
    course: Mapped["Course"] = relationship("Course", lazy="noload")

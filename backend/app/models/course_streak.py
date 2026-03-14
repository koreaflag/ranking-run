"""CourseStreak model - per-user, per-course consecutive run tracking."""

import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDPrimaryKeyMixin


class CourseStreak(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "course_streaks"
    __table_args__ = (
        UniqueConstraint("user_id", "course_id", name="uq_course_streak_user_course"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
    )
    course_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("courses.id"),
        nullable=False,
    )
    current_streak: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
    best_streak: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
    last_run_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

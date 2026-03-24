"""CourseDominion and CourseDominionHistory models."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDPrimaryKeyMixin


class CourseDominion(Base, UUIDPrimaryKeyMixin):
    """Tracks which crew currently dominates each course."""

    __tablename__ = "course_dominions"
    __table_args__ = (
        UniqueConstraint("course_id", name="uq_course_dominion_course"),
        Index("idx_course_dominions_crew", "crew_id"),
    )

    course_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("courses.id", ondelete="CASCADE"),
        nullable=False,
    )
    crew_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("crews.id", ondelete="CASCADE"),
        nullable=False,
    )
    crew_name: Mapped[str] = mapped_column(String(100), nullable=False)
    avg_duration_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    top_member_ids: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    points_accumulated: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
    dominated_since: Mapped[datetime] = mapped_column(
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

    # Relationships
    crew: Mapped["Crew"] = relationship("Crew", lazy="noload")
    course: Mapped["Course"] = relationship("Course", lazy="noload")


class CourseDominionHistory(Base, UUIDPrimaryKeyMixin):
    """Records dominion changes for notifications and history display."""

    __tablename__ = "course_dominion_history"
    __table_args__ = (
        Index("idx_dominion_history_course_time", "course_id", "changed_at"),
    )

    course_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("courses.id", ondelete="CASCADE"),
        nullable=False,
    )
    previous_crew_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("crews.id", ondelete="SET NULL"),
        nullable=True,
    )
    new_crew_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("crews.id", ondelete="CASCADE"),
        nullable=False,
    )
    previous_avg_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    new_avg_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

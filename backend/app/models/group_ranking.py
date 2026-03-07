"""GroupRanking model for course group leaderboards."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDPrimaryKeyMixin


class GroupRanking(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "group_rankings"
    __table_args__ = (
        UniqueConstraint(
            "course_id", "group_run_id", name="uq_group_ranking_course_group"
        ),
        Index(
            "idx_group_rankings_course_avg",
            "course_id",
            "avg_duration_seconds",
        ),
    )

    course_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("courses.id", ondelete="CASCADE"),
        nullable=False,
    )
    group_run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("group_runs.id", ondelete="CASCADE"),
        nullable=False,
    )
    group_name: Mapped[str] = mapped_column(String(30), nullable=False)
    avg_duration_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    completed_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
    total_members: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="1"
    )
    rank: Mapped[int | None] = mapped_column(Integer, nullable=True)
    achieved_at: Mapped[datetime] = mapped_column(
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
    group_run: Mapped["GroupRun"] = relationship("GroupRun", lazy="joined")

"""GroupRun and GroupRunMember models."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDPrimaryKeyMixin


class GroupRun(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "group_runs"
    __table_args__ = (
        Index("idx_group_runs_course_status", "course_id", "status"),
        Index("idx_group_runs_creator", "creator_id"),
    )

    course_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("courses.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(30), nullable=False)
    creator_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="active"
    )
    member_count: Mapped[int] = mapped_column(
        Integer, default=1, server_default="1"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    course: Mapped["Course"] = relationship("Course", lazy="noload")
    creator: Mapped["User | None"] = relationship("User", lazy="joined")
    members: Mapped[list["GroupRunMember"]] = relationship(
        back_populates="group_run",
        cascade="all, delete-orphan",
        lazy="noload",
    )


class GroupRunMember(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "group_run_members"
    __table_args__ = (
        UniqueConstraint("group_run_id", "user_id", name="uq_group_run_member"),
        Index("idx_group_run_members_user", "user_id"),
    )

    group_run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("group_runs.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="invited"
    )
    best_duration_seconds: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )
    best_pace_seconds_per_km: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    group_run: Mapped["GroupRun"] = relationship(back_populates="members")
    user: Mapped["User"] = relationship("User", lazy="joined")

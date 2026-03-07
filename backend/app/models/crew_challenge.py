"""CrewChallenge, CrewChallengeRecord, and CrewCourseRanking models."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDPrimaryKeyMixin


class CrewChallenge(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "crew_challenges"
    __table_args__ = (
        Index("idx_crew_challenges_crew_status", "crew_id", "status"),
        Index("idx_crew_challenges_course", "course_id"),
        Index(
            "idx_crew_challenges_active_unique",
            "crew_id",
            unique=True,
            postgresql_where=text("status = 'active'"),
        ),
    )

    crew_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("crews.id", ondelete="CASCADE"),
        nullable=False,
    )
    course_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("courses.id", ondelete="CASCADE"),
        nullable=False,
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="active"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    ended_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    crew: Mapped["Crew"] = relationship("Crew", lazy="noload")
    course: Mapped["Course"] = relationship("Course", lazy="noload")
    records: Mapped[list["CrewChallengeRecord"]] = relationship(
        back_populates="challenge",
        cascade="all, delete-orphan",
        lazy="noload",
    )


class CrewChallengeRecord(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "crew_challenge_records"
    __table_args__ = (
        UniqueConstraint(
            "challenge_id", "user_id", name="uq_crew_challenge_record_user"
        ),
        Index("idx_crew_challenge_records_user", "user_id"),
    )

    challenge_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("crew_challenges.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
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
    run_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )

    # Relationships
    challenge: Mapped["CrewChallenge"] = relationship(back_populates="records")
    user: Mapped["User"] = relationship("User", lazy="joined")


class CrewCourseRanking(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "crew_course_rankings"
    __table_args__ = (
        UniqueConstraint(
            "course_id", "crew_id", name="uq_crew_course_ranking"
        ),
        Index(
            "idx_crew_course_rankings_course_avg",
            "course_id",
            "avg_duration_seconds",
        ),
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
    crew_challenge_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("crew_challenges.id", ondelete="CASCADE"),
        nullable=False,
    )
    crew_name: Mapped[str] = mapped_column(String(100), nullable=False)
    avg_duration_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    completed_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
    total_participants: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
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
    crew: Mapped["Crew"] = relationship("Crew", lazy="joined")
    challenge: Mapped["CrewChallenge"] = relationship("CrewChallenge", lazy="noload")

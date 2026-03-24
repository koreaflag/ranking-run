"""Challenge and ChallengeParticipant models for goal-based challenges."""

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
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


class Challenge(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "challenges"
    __table_args__ = (
        Index("idx_challenges_active_dates", "is_active", "start_at", "end_at"),
    )

    title: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    challenge_type: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="individual_distance"
    )
    goal_value: Mapped[int] = mapped_column(Integer, nullable=False)
    reward_points: Mapped[int] = mapped_column(
        Integer, default=0, server_default="0"
    )
    start_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    end_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true"
    )

    # Relationships
    participants: Mapped[list["ChallengeParticipant"]] = relationship(
        back_populates="challenge",
        cascade="all, delete-orphan",
        lazy="noload",
    )


class ChallengeParticipant(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "challenge_participants"
    __table_args__ = (
        UniqueConstraint(
            "challenge_id", "user_id", name="uq_challenge_participant"
        ),
        Index("idx_challenge_participant_user", "user_id", "is_completed"),
    )

    challenge_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("challenges.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    crew_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("crews.id", ondelete="CASCADE"),
        nullable=True,
    )
    current_value: Mapped[int] = mapped_column(
        Integer, default=0, server_default="0"
    )
    is_completed: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false"
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
    challenge: Mapped["Challenge"] = relationship(back_populates="participants")
    user: Mapped["User"] = relationship("User", lazy="joined")

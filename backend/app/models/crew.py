"""Crew and CrewMember models."""

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Crew(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "crews"
    __table_args__ = (
        Index("idx_crews_owner_id", "owner_id"),
        Index("idx_crews_region", "region"),
        Index("idx_crews_created_at", "created_at"),
    )

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    logo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    region: Mapped[str | None] = mapped_column(String(100), nullable=True)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    member_count: Mapped[int] = mapped_column(
        Integer, default=1, server_default="1"
    )
    max_members: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_public: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true"
    )
    badge_color: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="'#FF7A33'"
    )
    badge_icon: Mapped[str] = mapped_column(
        String(50), nullable=False, server_default="'people'"
    )
    recurring_schedule: Mapped[str | None] = mapped_column(
        String(200), nullable=True
    )
    meeting_point: Mapped[str | None] = mapped_column(
        String(200), nullable=True
    )
    cover_image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    requires_approval: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false"
    )
    level: Mapped[int] = mapped_column(
        Integer, default=1, server_default="1"
    )
    total_xp: Mapped[int] = mapped_column(
        BigInteger, default=0, server_default="0"
    )
    grade_config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    last_activity_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=True,
    )

    # Relationships
    owner: Mapped["User"] = relationship("User", lazy="joined")
    members: Mapped[list["CrewMember"]] = relationship(
        back_populates="crew",
        cascade="all, delete-orphan",
        lazy="noload",
    )


class CrewMember(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "crew_members"
    __table_args__ = (
        UniqueConstraint("crew_id", "user_id", name="uq_crew_member"),
        Index("idx_crew_members_crew_id", "crew_id"),
        Index("idx_crew_members_user_id", "user_id"),
    )

    crew_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("crews.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    role: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="'member'"
    )
    grade_level: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="1"
    )
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    crew: Mapped["Crew"] = relationship(back_populates="members")
    user: Mapped["User"] = relationship("User", lazy="joined")

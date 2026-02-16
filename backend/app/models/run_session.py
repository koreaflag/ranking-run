"""RunSession model for active running sessions."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDPrimaryKeyMixin


class RunSession(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "run_sessions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
    )
    course_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("courses.id"),
        nullable=True,
    )
    status: Mapped[str] = mapped_column(
        String(20),
        default="active",
        server_default="active",
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    device_info: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    user: Mapped["User"] = relationship("User", lazy="joined")
    course: Mapped["Course | None"] = relationship("Course", lazy="joined")
    chunks: Mapped[list["RunChunk"]] = relationship(
        "RunChunk",
        back_populates="session",
        cascade="all, delete-orphan",
        lazy="noload",
        order_by="RunChunk.sequence",
    )

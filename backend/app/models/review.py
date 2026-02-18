"""Review model for course reviews and ratings."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDPrimaryKeyMixin


class Review(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "reviews"
    __table_args__ = (
        UniqueConstraint("course_id", "user_id", name="uq_reviews_course_user"),
        Index("idx_reviews_course_id", "course_id"),
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
    rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
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
    creator_reply: Mapped[str | None] = mapped_column(Text, nullable=True)
    creator_reply_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    user: Mapped["User"] = relationship("User", lazy="joined")
    course: Mapped["Course"] = relationship("Course", lazy="noload")

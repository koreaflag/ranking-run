"""Course comment model — threaded comments on courses with optional images."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, UUID, VARCHAR
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDPrimaryKeyMixin


class CourseComment(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "course_comments"
    __table_args__ = (
        Index("idx_course_comments_course_created", "course_id", "created_at"),
    )

    course_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("courses.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    image_urls: Mapped[list[str] | None] = mapped_column(
        ARRAY(VARCHAR(500)), nullable=True
    )
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("course_comments.id", ondelete="CASCADE"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    user: Mapped["User"] = relationship("User", lazy="joined")
    course: Mapped["Course"] = relationship("Course", lazy="noload")
    replies: Mapped[list["CourseComment"]] = relationship(
        "CourseComment",
        back_populates="parent",
        lazy="selectin",
        order_by="CourseComment.created_at",
    )
    parent: Mapped["CourseComment | None"] = relationship(
        "CourseComment",
        back_populates="replies",
        remote_side="CourseComment.id",
        lazy="noload",
    )

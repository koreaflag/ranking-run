"""Course likes model."""

import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID

from app.models.base import Base


class CourseLike(Base):
    __tablename__ = "course_likes"
    __table_args__ = (
        UniqueConstraint("user_id", "course_id", name="uq_course_likes_user_course"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    course_id = Column(UUID(as_uuid=True), ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

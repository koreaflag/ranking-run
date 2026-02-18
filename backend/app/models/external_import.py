"""ExternalImport model for GPX/FIT file imports and external service syncs."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDPrimaryKeyMixin


class ExternalImport(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "external_imports"
    __table_args__ = (
        Index("idx_imports_user_created", "user_id", "created_at"),
        UniqueConstraint("user_id", "external_id", "source", name="uq_imports_external"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
    )
    run_record_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("run_records.id"),
        nullable=True,
    )
    source: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )
    external_id: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )
    original_filename: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )
    file_path: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    raw_metadata: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    status: Mapped[str] = mapped_column(
        String(20),
        default="pending",
        server_default="pending",
    )
    error_message: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    import_summary: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    course_match: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

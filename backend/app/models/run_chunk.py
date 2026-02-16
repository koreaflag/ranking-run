"""RunChunk model for incremental GPS data uploads."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDPrimaryKeyMixin


class RunChunk(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "run_chunks"
    __table_args__ = (
        UniqueConstraint("session_id", "sequence", name="idx_chunks_session_seq"),
    )

    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("run_sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    chunk_type: Mapped[str] = mapped_column(String(20), nullable=False)
    raw_gps_points: Mapped[dict] = mapped_column(JSONB, nullable=False)
    filtered_points: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    chunk_summary: Mapped[dict] = mapped_column(JSONB, nullable=False)
    cumulative: Mapped[dict] = mapped_column(JSONB, nullable=False)
    completed_splits: Mapped[list | None] = mapped_column(JSONB, server_default="[]")
    pause_intervals: Mapped[list | None] = mapped_column(JSONB, server_default="[]")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    session: Mapped["RunSession"] = relationship("RunSession", back_populates="chunks")

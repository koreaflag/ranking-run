"""Add follows, events, and event_participants tables

Revision ID: 0004
Revises: 0003
Create Date: 2026-02-16

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ---- follows table ----
    op.create_table(
        "follows",
        sa.Column("id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("follower_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("following_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("follower_id", "following_id", name="uq_follow_pair"),
        sa.CheckConstraint("follower_id != following_id", name="ck_no_self_follow"),
    )
    op.create_index("idx_follows_follower", "follows", ["follower_id"])
    op.create_index("idx_follows_following", "follows", ["following_id"])

    # ---- events table ----
    op.create_table(
        "events",
        sa.Column("id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("title", sa.String(100), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("event_type", sa.String(20), nullable=False, server_default="challenge"),
        sa.Column("course_id", UUID(as_uuid=True), sa.ForeignKey("courses.id", ondelete="SET NULL"), nullable=True),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("target_distance_meters", sa.Integer, nullable=True),
        sa.Column("target_runs", sa.Integer, nullable=True),
        sa.Column("badge_color", sa.String(20), nullable=False, server_default="'#FF5252'"),
        sa.Column("badge_icon", sa.String(30), nullable=False, server_default="'trophy'"),
        sa.Column("max_participants", sa.Integer, nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("center_lat", sa.Float, nullable=True),
        sa.Column("center_lng", sa.Float, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_events_active_dates", "events", ["is_active", "starts_at", "ends_at"])

    # ---- event_participants table ----
    op.create_table(
        "event_participants",
        sa.Column("id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("event_id", UUID(as_uuid=True), sa.ForeignKey("events.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("progress_distance_meters", sa.Integer, nullable=False, server_default="0"),
        sa.Column("progress_runs", sa.Integer, nullable=False, server_default="0"),
        sa.Column("completed", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("joined_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("event_id", "user_id", name="uq_event_participant"),
    )
    op.create_index("idx_event_participants_event", "event_participants", ["event_id"])
    op.create_index("idx_event_participants_user", "event_participants", ["user_id"])


def downgrade() -> None:
    op.drop_table("event_participants")
    op.drop_table("events")
    op.drop_table("follows")

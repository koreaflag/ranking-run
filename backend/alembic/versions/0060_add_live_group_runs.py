"""Add live_group_runs and live_group_run_participants tables.

Revision ID: 0060
Revises: 0059
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "0060"
down_revision = "0059"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "live_group_runs",
        sa.Column("id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("course_id", UUID(as_uuid=True), nullable=False),
        sa.Column("host_user_id", UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(100), nullable=False),
        sa.Column("status", sa.String(20), server_default="waiting", nullable=False),
        sa.Column("max_participants", sa.Integer(), server_default="10", nullable=False),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["host_user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("idx_live_group_runs_course_status", "live_group_runs", ["course_id", "status"])
    op.create_index("idx_live_group_runs_host", "live_group_runs", ["host_user_id"])

    op.create_table(
        "live_group_run_participants",
        sa.Column("id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("live_group_run_id", UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(20), server_default="joined", nullable=False),
        sa.Column("current_distance_m", sa.Float(), server_default="0", nullable=False),
        sa.Column("current_duration_s", sa.Integer(), server_default="0", nullable=False),
        sa.Column("last_lat", sa.Float(), nullable=True),
        sa.Column("last_lng", sa.Float(), nullable=True),
        sa.Column("last_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("joined_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["live_group_run_id"], ["live_group_runs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index(
        "uq_live_group_run_participant",
        "live_group_run_participants",
        ["live_group_run_id", "user_id"],
        unique=True,
    )
    op.create_index(
        "idx_live_group_run_participant_user",
        "live_group_run_participants",
        ["user_id"],
    )


def downgrade() -> None:
    op.drop_index("idx_live_group_run_participant_user", table_name="live_group_run_participants")
    op.drop_index("uq_live_group_run_participant", table_name="live_group_run_participants")
    op.drop_table("live_group_run_participants")
    op.drop_index("idx_live_group_runs_host", table_name="live_group_runs")
    op.drop_index("idx_live_group_runs_course_status", table_name="live_group_runs")
    op.drop_table("live_group_runs")

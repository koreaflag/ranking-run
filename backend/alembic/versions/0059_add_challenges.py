"""Add challenges and challenge_participants tables.

Revision ID: 0059
Revises: 0058
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "0059"
down_revision = "0058"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "challenges",
        sa.Column("id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("title", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("challenge_type", sa.String(20), server_default="individual_distance", nullable=False),
        sa.Column("goal_value", sa.Integer(), nullable=False),
        sa.Column("reward_points", sa.Integer(), server_default="0", nullable=False),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_challenges_active_dates", "challenges", ["is_active", "start_at", "end_at"])

    op.create_table(
        "challenge_participants",
        sa.Column("id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("challenge_id", UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), nullable=False),
        sa.Column("crew_id", UUID(as_uuid=True), nullable=True),
        sa.Column("current_value", sa.Integer(), server_default="0", nullable=False),
        sa.Column("is_completed", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("joined_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["challenge_id"], ["challenges.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["crew_id"], ["crews.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("challenge_id", "user_id", name="uq_challenge_participant"),
    )
    op.create_index("idx_challenge_participant_user", "challenge_participants", ["user_id", "is_completed"])


def downgrade() -> None:
    op.drop_index("idx_challenge_participant_user", table_name="challenge_participants")
    op.drop_table("challenge_participants")
    op.drop_index("idx_challenges_active_dates", table_name="challenges")
    op.drop_table("challenges")

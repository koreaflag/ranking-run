"""Add course_dominions and course_dominion_history tables.

Revision ID: 0055
Revises: 0054
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0055"
down_revision = "0054"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "course_dominions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("course_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("crew_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("crew_name", sa.String(100), nullable=False),
        sa.Column("avg_duration_seconds", sa.Integer(), nullable=False),
        sa.Column("top_member_ids", postgresql.JSONB(), server_default="[]", nullable=False),
        sa.Column("points_accumulated", sa.Integer(), server_default="0", nullable=False),
        sa.Column("dominated_since", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["crew_id"], ["crews.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("course_id", name="uq_course_dominion_course"),
    )
    op.create_index("idx_course_dominions_crew", "course_dominions", ["crew_id"])

    op.create_table(
        "course_dominion_history",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("course_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("previous_crew_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("new_crew_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("previous_avg_seconds", sa.Integer(), nullable=True),
        sa.Column("new_avg_seconds", sa.Integer(), nullable=False),
        sa.Column("changed_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["previous_crew_id"], ["crews.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["new_crew_id"], ["crews.id"], ondelete="CASCADE"),
    )
    op.create_index("idx_dominion_history_course_time", "course_dominion_history", ["course_id", "changed_at"])


def downgrade() -> None:
    op.drop_table("course_dominion_history")
    op.drop_table("course_dominions")

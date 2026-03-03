"""Extend events table for crews: recurring_schedule, meeting_point, creator_id.

Revision ID: 0022
Revises: 0021
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "events",
        sa.Column("recurring_schedule", sa.String(100), nullable=True),
    )
    op.add_column(
        "events",
        sa.Column("meeting_point", sa.String(200), nullable=True),
    )
    op.add_column(
        "events",
        sa.Column(
            "creator_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("events", "creator_id")
    op.drop_column("events", "meeting_point")
    op.drop_column("events", "recurring_schedule")

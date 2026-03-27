"""Add goal_data JSONB column to run_records for tracking run goals.

Revision ID: 0062
Revises: 0061
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0062"
down_revision = "0061"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "run_records",
        sa.Column("goal_data", JSONB, nullable=True),
    )


def downgrade() -> None:
    op.drop_column("run_records", "goal_data")

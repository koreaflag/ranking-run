"""Add speed anomaly flag fields to run_records.

Revision ID: 0015
Revises: 0014
"""

from alembic import op
import sqlalchemy as sa

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "run_records",
        sa.Column("is_flagged", sa.Boolean(), server_default="false", nullable=False),
    )
    op.add_column(
        "run_records",
        sa.Column("flag_reason", sa.String(500), nullable=True),
    )
    # Index for efficient filtering of flagged records in rankings
    op.create_index("idx_runs_is_flagged", "run_records", ["is_flagged"])


def downgrade() -> None:
    op.drop_index("idx_runs_is_flagged", table_name="run_records")
    op.drop_column("run_records", "flag_reason")
    op.drop_column("run_records", "is_flagged")

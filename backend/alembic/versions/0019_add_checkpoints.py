"""Add checkpoint columns to courses and run_records tables

Revision ID: 0019
Revises: 0018
Create Date: 2026-02-22

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0019"
down_revision: Union[str, None] = "0018"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("courses", sa.Column("checkpoints", JSONB, nullable=True))
    op.add_column(
        "courses",
        sa.Column("checkpoint_interval_meters", sa.Integer(), nullable=True, server_default="500"),
    )
    op.add_column("run_records", sa.Column("checkpoint_results", JSONB, nullable=True))


def downgrade() -> None:
    op.drop_column("run_records", "checkpoint_results")
    op.drop_column("courses", "checkpoint_interval_meters")
    op.drop_column("courses", "checkpoints")

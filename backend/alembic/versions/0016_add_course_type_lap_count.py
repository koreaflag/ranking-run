"""Add course_type and lap_count columns to courses

Revision ID: 0016
Revises: 0015
Create Date: 2026-02-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0016"
down_revision: Union[str, None] = "0015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "courses",
        sa.Column("course_type", sa.String(10), nullable=True),
    )
    op.add_column(
        "courses",
        sa.Column("lap_count", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("courses", "lap_count")
    op.drop_column("courses", "course_type")

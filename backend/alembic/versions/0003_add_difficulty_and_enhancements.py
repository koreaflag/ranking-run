"""Add difficulty column to courses and backfill based on distance

Revision ID: 0003
Revises: 0002
Create Date: 2026-02-16

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add difficulty column
    op.add_column(
        "courses",
        sa.Column("difficulty", sa.String(10), nullable=True),
    )

    # Backfill existing courses based on distance_meters
    # < 3000m -> "easy", 3000-7000m -> "medium", > 7000m -> "hard"
    op.execute(
        """
        UPDATE courses
        SET difficulty = CASE
            WHEN distance_meters < 3000 THEN 'easy'
            WHEN distance_meters <= 7000 THEN 'medium'
            ELSE 'hard'
        END
        WHERE difficulty IS NULL
        """
    )


def downgrade() -> None:
    op.drop_column("courses", "difficulty")

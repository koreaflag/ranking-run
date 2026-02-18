"""Add creator_reply and creator_reply_at columns to reviews table

Revision ID: 0009
Revises: 0008
Create Date: 2026-02-17

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("reviews", sa.Column("creator_reply", sa.Text(), nullable=True))
    op.add_column(
        "reviews",
        sa.Column("creator_reply_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("reviews", "creator_reply_at")
    op.drop_column("reviews", "creator_reply")

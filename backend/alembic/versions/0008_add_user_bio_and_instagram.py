"""Add bio and instagram_username columns to users table

Revision ID: 0008
Revises: 0007
Create Date: 2026-02-17

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("bio", sa.String(100), nullable=True))
    op.add_column("users", sa.Column("instagram_username", sa.String(30), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "instagram_username")
    op.drop_column("users", "bio")

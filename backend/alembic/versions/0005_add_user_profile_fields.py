"""Add birthday, height_cm, weight_kg to users table

Revision ID: 0005
Revises: 0004
Create Date: 2026-02-17

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("birthday", sa.Date(), nullable=True))
    op.add_column("users", sa.Column("height_cm", sa.Float(), nullable=True))
    op.add_column("users", sa.Column("weight_kg", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "weight_kg")
    op.drop_column("users", "height_cm")
    op.drop_column("users", "birthday")

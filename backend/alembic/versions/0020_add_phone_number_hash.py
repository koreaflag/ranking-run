"""Add phone_number_hash column to users

Revision ID: 0020
Revises: 0019
Create Date: 2026-02-25

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0020"
down_revision: Union[str, None] = "0019"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("phone_number_hash", sa.String(64), nullable=True))
    # Partial unique index: only enforce uniqueness on non-NULL values
    op.create_index(
        "ix_users_phone_number_hash",
        "users",
        ["phone_number_hash"],
        unique=True,
        postgresql_where=sa.text("phone_number_hash IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_users_phone_number_hash", table_name="users")
    op.drop_column("users", "phone_number_hash")

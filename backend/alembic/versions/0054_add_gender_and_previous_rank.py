"""Add gender to users and previous_rank to rankings.

Revision ID: 0054
Revises: 0053
Create Date: 2026-03-22
"""
from alembic import op
import sqlalchemy as sa

revision = "0054"
down_revision = "0053"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("gender", sa.String(10), nullable=True))
    op.add_column("rankings", sa.Column("previous_rank", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("rankings", "previous_rank")
    op.drop_column("users", "gender")

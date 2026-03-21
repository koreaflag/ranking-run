"""Add scope column to admin_changelogs (admin vs app).

Revision ID: 0052
Revises: 0051
Create Date: 2026-03-21
"""
import sqlalchemy as sa
from alembic import op

revision = "0052"
down_revision = "0051"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("admin_changelogs", sa.Column("scope", sa.String(20), nullable=True))
    op.execute("UPDATE admin_changelogs SET scope = 'admin'")
    op.alter_column("admin_changelogs", "scope", nullable=False, server_default="app")


def downgrade() -> None:
    op.drop_column("admin_changelogs", "scope")

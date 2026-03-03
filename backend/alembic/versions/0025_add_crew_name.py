"""Add crew_name field to users table.

Revision ID: 0025
Revises: 0024
"""

from alembic import op
import sqlalchemy as sa

revision = "0025"
down_revision = "0024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("crew_name", sa.String(50), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "crew_name")

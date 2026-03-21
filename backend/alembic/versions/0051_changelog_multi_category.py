"""Change admin_changelogs category to categories (JSONB array).

Revision ID: 0051
Revises: 0050
Create Date: 2026-03-21
"""
import sqlalchemy as sa
from alembic import op

revision = "0051"
down_revision = "0050"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Convert single category to JSONB array
    op.add_column("admin_changelogs", sa.Column("categories", sa.dialects.postgresql.JSONB, nullable=True))
    op.execute("UPDATE admin_changelogs SET categories = jsonb_build_array(category)")
    op.alter_column("admin_changelogs", "categories", nullable=False)
    op.drop_index("idx_admin_changelogs_category", "admin_changelogs")
    op.drop_column("admin_changelogs", "category")


def downgrade() -> None:
    op.add_column("admin_changelogs", sa.Column("category", sa.String(20), nullable=True))
    op.execute("UPDATE admin_changelogs SET category = categories->>0")
    op.alter_column("admin_changelogs", "category", nullable=False)
    op.create_index("idx_admin_changelogs_category", "admin_changelogs", ["category"])
    op.drop_column("admin_changelogs", "categories")

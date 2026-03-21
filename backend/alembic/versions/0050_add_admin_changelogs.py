"""Add admin_changelogs and admin_changelog_comments tables.

Revision ID: 0050
Revises: 0049
Create Date: 2026-03-21
"""
import sqlalchemy as sa
from alembic import op

revision = "0050"
down_revision = "0049"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "admin_changelogs",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("category", sa.String(20), nullable=False),  # ui, db, feature
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("author", sa.String(100), nullable=False),  # admin name or 'Claude'
        sa.Column("version", sa.String(20), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("idx_admin_changelogs_category", "admin_changelogs", ["category"])
    op.create_index("idx_admin_changelogs_created_at", "admin_changelogs", ["created_at"])

    op.create_table(
        "admin_changelog_comments",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("changelog_id", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("admin_changelogs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("author", sa.String(100), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("idx_admin_changelog_comments_changelog_id", "admin_changelog_comments", ["changelog_id"])


def downgrade() -> None:
    op.drop_table("admin_changelog_comments")
    op.drop_table("admin_changelogs")

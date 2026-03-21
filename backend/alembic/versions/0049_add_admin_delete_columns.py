"""Add admin deletion columns to community_posts and community_comments.

Revision ID: 0049
Revises: 0048_fix_course_fk_cascades
Create Date: 2026-03-21
"""
import sqlalchemy as sa
from alembic import op

revision = "0049"
down_revision = "0048_fix_course_fk_cascades"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("community_posts", sa.Column("admin_deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("community_posts", sa.Column("admin_delete_reason", sa.String(500), nullable=True))
    op.add_column("community_comments", sa.Column("admin_deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("community_comments", sa.Column("admin_delete_reason", sa.String(500), nullable=True))


def downgrade() -> None:
    op.drop_column("community_comments", "admin_delete_reason")
    op.drop_column("community_comments", "admin_deleted_at")
    op.drop_column("community_posts", "admin_delete_reason")
    op.drop_column("community_posts", "admin_deleted_at")

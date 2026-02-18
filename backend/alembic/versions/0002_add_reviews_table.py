"""Add reviews table

Revision ID: 0002
Revises: 0001
Create Date: 2026-02-16

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "reviews",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("course_id", sa.UUID(), sa.ForeignKey("courses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_index("idx_reviews_course_id", "reviews", ["course_id"])
    op.create_unique_constraint("idx_reviews_course_user", "reviews", ["course_id", "user_id"])


def downgrade() -> None:
    op.drop_constraint("idx_reviews_course_user", "reviews", type_="unique")
    op.drop_index("idx_reviews_course_id", table_name="reviews")
    op.drop_table("reviews")

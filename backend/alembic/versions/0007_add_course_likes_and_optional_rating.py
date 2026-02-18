"""Add course_likes table and make reviews.rating nullable

Revision ID: 0007
Revises: 0006
Create Date: 2026-02-17

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create course_likes table
    op.create_table(
        "course_likes",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("course_id", UUID(as_uuid=True), sa.ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("user_id", "course_id", name="uq_course_likes_user_course"),
    )

    # Make reviews.rating nullable (allow text-only reviews without star ratings)
    op.alter_column(
        "reviews",
        "rating",
        existing_type=sa.Integer(),
        nullable=True,
    )


def downgrade() -> None:
    # Revert reviews.rating to non-nullable (set NULLs to 0 first)
    op.execute("UPDATE reviews SET rating = 0 WHERE rating IS NULL")
    op.alter_column(
        "reviews",
        "rating",
        existing_type=sa.Integer(),
        nullable=False,
    )

    op.drop_table("course_likes")

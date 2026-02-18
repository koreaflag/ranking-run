"""Add course_favorites table

Revision ID: 0006
Revises: 0005
Create Date: 2026-02-17

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "course_favorites",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("course_id", UUID(as_uuid=True), sa.ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("user_id", "course_id", name="uq_course_favorites_user_course"),
    )


def downgrade() -> None:
    op.drop_table("course_favorites")

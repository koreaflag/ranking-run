"""Add parent_id to course_comments for reply threads.

Revision ID: 0057
Revises: 0056
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0057"
down_revision = "0056"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "course_comments",
        sa.Column(
            "parent_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("course_comments.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.create_index(
        "idx_course_comments_parent",
        "course_comments",
        ["parent_id"],
    )


def downgrade() -> None:
    op.drop_index("idx_course_comments_parent", "course_comments")
    op.drop_column("course_comments", "parent_id")

"""Make community_post title nullable for crew thread-style posts."""

import sqlalchemy as sa
from alembic import op

revision = "0037"
down_revision = "0036"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "community_posts",
        "title",
        existing_type=sa.String(100),
        nullable=True,
    )


def downgrade() -> None:
    # Backfill NULLs before making NOT NULL again
    op.execute("UPDATE community_posts SET title = '' WHERE title IS NULL")
    op.alter_column(
        "community_posts",
        "title",
        existing_type=sa.String(100),
        nullable=False,
    )

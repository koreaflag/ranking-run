"""Add image_urls JSONB column to community_posts for multi-image support."""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from alembic import op

revision = "0038"
down_revision = "0037"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "community_posts",
        sa.Column("image_urls", JSONB, nullable=True),
    )
    # Migrate existing single image_url to image_urls array
    op.execute(
        "UPDATE community_posts SET image_urls = jsonb_build_array(image_url) "
        "WHERE image_url IS NOT NULL AND image_urls IS NULL"
    )


def downgrade() -> None:
    op.drop_column("community_posts", "image_urls")

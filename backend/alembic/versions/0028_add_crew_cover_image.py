"""Add cover_image_url to crews table."""

from alembic import op
import sqlalchemy as sa

revision = "0028"
down_revision = "0027"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "crews",
        sa.Column("cover_image_url", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("crews", "cover_image_url")

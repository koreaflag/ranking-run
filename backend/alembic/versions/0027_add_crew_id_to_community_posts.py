"""Add crew_id FK to community_posts."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0027"
down_revision = "0026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "community_posts",
        sa.Column("crew_id", UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_community_posts_crew_id",
        "community_posts",
        "crews",
        ["crew_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "idx_community_posts_crew_id",
        "community_posts",
        ["crew_id"],
    )


def downgrade() -> None:
    op.drop_index("idx_community_posts_crew_id", table_name="community_posts")
    op.drop_constraint(
        "fk_community_posts_crew_id", "community_posts", type_="foreignkey"
    )
    op.drop_column("community_posts", "crew_id")

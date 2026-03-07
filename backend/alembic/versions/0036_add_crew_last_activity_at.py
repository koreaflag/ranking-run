"""Add last_activity_at column to crews table."""

import sqlalchemy as sa
from alembic import op

revision = "0036"
down_revision = "0035"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "crews",
        sa.Column(
            "last_activity_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=True,
        ),
    )
    # Initialize existing rows with updated_at value
    op.execute("UPDATE crews SET last_activity_at = COALESCE(updated_at, created_at)")


def downgrade() -> None:
    op.drop_column("crews", "last_activity_at")

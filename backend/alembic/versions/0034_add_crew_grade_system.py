"""Add crew grade system: grade_config on crews, grade_level on crew_members."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0034"
down_revision = "0033"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add grade_config JSONB column to crews
    op.add_column(
        "crews",
        sa.Column("grade_config", JSONB, nullable=True),
    )

    # Add grade_level column to crew_members (nullable first for backfill)
    op.add_column(
        "crew_members",
        sa.Column("grade_level", sa.Integer(), nullable=True),
    )

    # Backfill: owner→1, admin→2, member→5
    op.execute(
        "UPDATE crew_members SET grade_level = CASE "
        "WHEN role = 'owner' THEN 1 "
        "WHEN role = 'admin' THEN 2 "
        "ELSE 5 END"
    )

    # Make grade_level NOT NULL with default
    op.alter_column(
        "crew_members",
        "grade_level",
        nullable=False,
        server_default="5",
    )

    # Composite index for efficient grade-based queries
    op.create_index(
        "idx_crew_members_grade_level",
        "crew_members",
        ["crew_id", "grade_level"],
    )


def downgrade() -> None:
    op.drop_index("idx_crew_members_grade_level", table_name="crew_members")
    op.drop_column("crew_members", "grade_level")
    op.drop_column("crews", "grade_config")

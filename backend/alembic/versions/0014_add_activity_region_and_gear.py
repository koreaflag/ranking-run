"""Add activity_region column to users and user_gear table.

Revision ID: 0014
Revises: 0013
Create Date: 2026-02-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0014"
down_revision: Union[str, None] = "0013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add activity_region to users table
    op.add_column(
        "users",
        sa.Column("activity_region", sa.String(100), nullable=True),
    )

    # Create user_gear table
    op.create_table(
        "user_gear",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.func.gen_random_uuid(),
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("brand", sa.String(50), nullable=False),
        sa.Column("model_name", sa.String(100), nullable=False),
        sa.Column("image_url", sa.Text(), nullable=True),
        sa.Column(
            "is_primary",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
        sa.Column(
            "total_distance_meters",
            sa.Float(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # Indices for user_gear
    op.create_index("ix_user_gear_user_id", "user_gear", ["user_id"])
    op.create_index(
        "ix_user_gear_user_primary",
        "user_gear",
        ["user_id", "is_primary"],
    )


def downgrade() -> None:
    op.drop_index("ix_user_gear_user_primary", table_name="user_gear")
    op.drop_index("ix_user_gear_user_id", table_name="user_gear")
    op.drop_table("user_gear")
    op.drop_column("users", "activity_region")

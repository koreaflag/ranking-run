"""Create crews and crew_members tables.

Revision ID: 0026
Revises: 0025
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0026"
down_revision = "0025"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # crews
    op.create_table(
        "crews",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            primary_key=True,
        ),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("logo_url", sa.Text(), nullable=True),
        sa.Column("region", sa.String(100), nullable=True),
        sa.Column(
            "owner_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "member_count",
            sa.Integer(),
            nullable=False,
            server_default="1",
        ),
        sa.Column(
            "max_members",
            sa.Integer(),
            nullable=True,
        ),
        sa.Column(
            "is_public",
            sa.Boolean(),
            nullable=False,
            server_default="true",
        ),
        sa.Column("badge_color", sa.String(20), nullable=False, server_default="'#FF7A33'"),
        sa.Column("badge_icon", sa.String(50), nullable=False, server_default="'people'"),
        sa.Column("recurring_schedule", sa.String(200), nullable=True),
        sa.Column("meeting_point", sa.String(200), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("idx_crews_owner_id", "crews", ["owner_id"])
    op.create_index("idx_crews_region", "crews", ["region"])
    op.create_index("idx_crews_created_at", "crews", ["created_at"])

    # crew_members
    op.create_table(
        "crew_members",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            primary_key=True,
        ),
        sa.Column(
            "crew_id",
            UUID(as_uuid=True),
            sa.ForeignKey("crews.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "role",
            sa.String(20),
            nullable=False,
            server_default="'member'",
        ),
        sa.Column(
            "joined_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("crew_id", "user_id", name="uq_crew_member"),
    )
    op.create_index("idx_crew_members_crew_id", "crew_members", ["crew_id"])
    op.create_index("idx_crew_members_user_id", "crew_members", ["user_id"])


def downgrade() -> None:
    op.drop_table("crew_members")
    op.drop_table("crews")

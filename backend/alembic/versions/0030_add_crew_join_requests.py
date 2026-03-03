"""Add crew_join_requests table and requires_approval to crews."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0030"
down_revision = "0029"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add requires_approval to crews
    op.add_column(
        "crews",
        sa.Column(
            "requires_approval",
            sa.Boolean(),
            server_default="false",
            nullable=False,
        ),
    )

    # Create crew_join_requests table
    op.create_table(
        "crew_join_requests",
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
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default="pending",
        ),
        sa.Column(
            "reviewed_by",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "reviewed_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.create_index(
        "idx_crew_join_requests_crew_status",
        "crew_join_requests",
        ["crew_id", "status"],
    )
    op.create_index(
        "idx_crew_join_requests_user",
        "crew_join_requests",
        ["user_id"],
    )
    # Only one pending request per user per crew
    op.create_index(
        "uq_crew_join_request_pending",
        "crew_join_requests",
        ["crew_id", "user_id"],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
    )


def downgrade() -> None:
    op.drop_index("uq_crew_join_request_pending")
    op.drop_index("idx_crew_join_requests_user")
    op.drop_index("idx_crew_join_requests_crew_status")
    op.drop_table("crew_join_requests")
    op.drop_column("crews", "requires_approval")

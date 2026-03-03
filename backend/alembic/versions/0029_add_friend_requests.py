"""Add friend_requests table for friend request system."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0029"
down_revision = "0028"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "friend_requests",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            primary_key=True,
        ),
        sa.Column(
            "requester_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "recipient_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default="pending",
        ),
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
        sa.UniqueConstraint(
            "requester_id", "recipient_id", name="uq_friend_request_pair"
        ),
        sa.CheckConstraint(
            "requester_id != recipient_id", name="ck_no_self_friend_request"
        ),
    )
    op.create_index(
        "idx_friend_requests_recipient_status",
        "friend_requests",
        ["recipient_id", "status"],
    )
    op.create_index(
        "idx_friend_requests_requester",
        "friend_requests",
        ["requester_id"],
    )


def downgrade() -> None:
    op.drop_index("idx_friend_requests_requester")
    op.drop_index("idx_friend_requests_recipient_status")
    op.drop_table("friend_requests")

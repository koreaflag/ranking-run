"""Add error_logs table for self-hosted error monitoring.

Revision ID: 0061
Revises: 0060
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "0061"
down_revision = "0060"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "error_logs",
        sa.Column("id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("error_type", sa.String(255), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("traceback", sa.Text(), nullable=False),
        sa.Column("endpoint", sa.String(500), nullable=True),
        sa.Column("method", sa.String(10), nullable=True),
        sa.Column("user_id", UUID(as_uuid=True), nullable=True),
        sa.Column("status_code", sa.Integer(), nullable=False),
        sa.Column("request_body", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_error_logs_created_at", "error_logs", [sa.text("created_at DESC")])
    op.create_index("idx_error_logs_error_type", "error_logs", ["error_type"])


def downgrade() -> None:
    op.drop_index("idx_error_logs_error_type", table_name="error_logs")
    op.drop_index("idx_error_logs_created_at", table_name="error_logs")
    op.drop_table("error_logs")

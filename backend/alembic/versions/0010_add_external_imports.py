"""Add external_imports table and source column to run_records

Revision ID: 0010
Revises: 0009
Create Date: 2026-02-17

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision: str = "0010"
down_revision: Union[str, None] = "0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create external_imports table
    op.create_table(
        "external_imports",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("run_record_id", UUID(as_uuid=True), sa.ForeignKey("run_records.id"), nullable=True),
        sa.Column("source", sa.String(20), nullable=False),
        sa.Column("external_id", sa.String(255), nullable=True),
        sa.Column("original_filename", sa.String(255), nullable=True),
        sa.Column("file_path", sa.Text(), nullable=True),
        sa.Column("raw_metadata", JSONB(), nullable=True),
        sa.Column("status", sa.String(20), server_default="pending", nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("import_summary", JSONB(), nullable=True),
        sa.Column("course_match", JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("idx_imports_user_created", "external_imports", ["user_id", "created_at"])
    op.create_unique_constraint("uq_imports_external", "external_imports", ["user_id", "external_id", "source"])

    # Add source and external_import_id to run_records
    op.add_column("run_records", sa.Column("source", sa.String(20), server_default="app", nullable=False))
    op.add_column("run_records", sa.Column("external_import_id", UUID(as_uuid=True), sa.ForeignKey("external_imports.id"), nullable=True))


def downgrade() -> None:
    op.drop_column("run_records", "external_import_id")
    op.drop_column("run_records", "source")
    op.drop_table("external_imports")

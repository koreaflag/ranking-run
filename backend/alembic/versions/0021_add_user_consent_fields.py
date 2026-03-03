"""Add user consent timestamp fields.

Revision ID: 0021
Revises: 0020
"""

from alembic import op
import sqlalchemy as sa

revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("consent_terms_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("consent_privacy_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("consent_location_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("consent_contacts_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("consent_marketing_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "consent_marketing_at")
    op.drop_column("users", "consent_contacts_at")
    op.drop_column("users", "consent_location_at")
    op.drop_column("users", "consent_privacy_at")
    op.drop_column("users", "consent_terms_at")

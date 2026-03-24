"""Add index on users.country for ranking filter performance.

Revision ID: 0058
Revises: 0057
"""

from alembic import op

revision = "0058"
down_revision = "0057"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("ix_users_country", "users", ["country"])


def downgrade() -> None:
    op.drop_index("ix_users_country", table_name="users")

"""Add revoked_at column to refresh_tokens table.

Tracks when a refresh token was revoked for accurate grace period calculation.
"""

import sqlalchemy as sa
from alembic import op

revision = '0045'
down_revision = '0044'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'refresh_tokens',
        sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('refresh_tokens', 'revoked_at')

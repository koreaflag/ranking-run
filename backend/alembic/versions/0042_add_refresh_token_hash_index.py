"""Add index on refresh_tokens.token_hash for O(1) lookup."""

from alembic import op

revision = '0042'
down_revision = '0041'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index('idx_refresh_token_hash', 'refresh_tokens', ['token_hash'])


def downgrade() -> None:
    op.drop_index('idx_refresh_token_hash', table_name='refresh_tokens')

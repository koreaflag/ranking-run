"""Add weekly_goal_km column to users table.

Allows users to configure their own weekly running goal instead of the
hardcoded 20 km default.
"""

import sqlalchemy as sa
from alembic import op

revision = '0047'
down_revision = '0046'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column('weekly_goal_km', sa.Float, nullable=False, server_default='20.0'),
    )


def downgrade() -> None:
    op.drop_column('users', 'weekly_goal_km')

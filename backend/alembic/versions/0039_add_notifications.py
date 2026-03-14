"""Add notifications table for in-app notification inbox."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0039'
down_revision = '0038'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'notifications',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('type', sa.String(30), nullable=False),
        sa.Column('actor_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('target_id', sa.String(), nullable=True),
        sa.Column('target_type', sa.String(20), nullable=True),
        sa.Column('data', postgresql.JSONB(), nullable=True),
        sa.Column('is_read', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['actor_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_notifications_user_created', 'notifications', ['user_id', 'created_at'])
    op.create_index('ix_notifications_user_unread', 'notifications', ['user_id', 'is_read'])


def downgrade() -> None:
    op.drop_index('ix_notifications_user_unread', table_name='notifications')
    op.drop_index('ix_notifications_user_created', table_name='notifications')
    op.drop_table('notifications')

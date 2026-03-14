"""Add point_transactions, course_streaks, crew level/xp, run_record map matching columns."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = '0041'
down_revision = '0040'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- point_transactions ---
    op.create_table(
        'point_transactions',
        sa.Column('id', UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('amount', sa.Integer(), nullable=False),
        sa.Column('balance_after', sa.Integer(), nullable=False),
        sa.Column('tx_type', sa.String(30), nullable=False),
        sa.Column('reference_id', UUID(as_uuid=True), nullable=True),
        sa.Column('description', sa.String(200), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_point_tx_user_created', 'point_transactions', ['user_id', sa.text('created_at DESC')])

    # --- course_streaks ---
    op.create_table(
        'course_streaks',
        sa.Column('id', UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('course_id', UUID(as_uuid=True), sa.ForeignKey('courses.id'), nullable=False),
        sa.Column('current_streak', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('best_streak', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('last_run_date', sa.Date(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'course_id', name='uq_course_streak_user_course'),
    )

    # --- crews: level + total_xp ---
    op.add_column('crews', sa.Column('level', sa.Integer(), nullable=False, server_default='1'))
    op.add_column('crews', sa.Column('total_xp', sa.BigInteger(), nullable=False, server_default='0'))

    # --- run_records: map matching columns ---
    op.add_column('run_records', sa.Column('map_matching_confidence', sa.Float(), nullable=True))
    op.add_column('run_records', sa.Column('signal_gap_segments', JSONB(), nullable=True))

    # Backfill crew XP from member run distances
    op.execute("""
        UPDATE crews c SET total_xp = sub.xp, level = CASE
            WHEN sub.xp >= 1000000000 THEN 10
            WHEN sub.xp >= 500000000 THEN 9
            WHEN sub.xp >= 150000000 THEN 8
            WHEN sub.xp >= 50000000 THEN 7
            WHEN sub.xp >= 15000000 THEN 6
            WHEN sub.xp >= 5000000 THEN 5
            WHEN sub.xp >= 1500000 THEN 4
            WHEN sub.xp >= 500000 THEN 3
            WHEN sub.xp >= 100000 THEN 2
            ELSE 1
        END
        FROM (
            SELECT cm.crew_id, COALESCE(SUM(r.distance_meters), 0) AS xp
            FROM crew_members cm
            LEFT JOIN run_records r ON r.user_id = cm.user_id
            GROUP BY cm.crew_id
        ) sub
        WHERE c.id = sub.crew_id;
    """)


def downgrade() -> None:
    op.drop_column('run_records', 'signal_gap_segments')
    op.drop_column('run_records', 'map_matching_confidence')
    op.drop_column('crews', 'total_xp')
    op.drop_column('crews', 'level')
    op.drop_table('course_streaks')
    op.drop_index('idx_point_tx_user_created', table_name='point_transactions')
    op.drop_table('point_transactions')

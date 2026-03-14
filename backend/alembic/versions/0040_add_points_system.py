"""Add total_points to users + backfill from existing run records."""

from alembic import op
import sqlalchemy as sa

revision = '0040'
down_revision = '0039'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('total_points', sa.BigInteger(), nullable=False, server_default='0'))

    # Backfill points for existing users based on run history
    # Formula: 10pt per km (distance_meters / 100) + 30pt bonus per course run
    op.execute("""
        UPDATE users u SET total_points = sub.pts
        FROM (
            SELECT r.user_id,
                   COALESCE(SUM(
                       (r.distance_meters / 100)
                       + CASE WHEN r.course_id IS NOT NULL THEN 30 ELSE 0 END
                   ), 0) AS pts
            FROM run_records r
            GROUP BY r.user_id
        ) sub
        WHERE u.id = sub.user_id
    """)


def downgrade() -> None:
    op.drop_column('users', 'total_points')

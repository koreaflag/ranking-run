"""Add raw_route_geometry, CHECK constraints, CASCADE on rankings.user_id, partial index.

- run_records.raw_route_geometry: Geography(LINESTRING, 4326) column for original GPS route
- run_records CHECK constraints: distance >= 0, duration >= 0, finished_at NULL or > started_at
- users CHECK constraints: total_distance_meters >= 0, total_runs >= 0, total_points >= 0
- rankings.user_id: ondelete CASCADE (already present in model, ensure DB matches)
- idx_runs_user_not_flagged: partial index on (user_id) WHERE is_flagged = false
"""

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geography

revision = '0046'
down_revision = '0045'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add raw_route_geometry column
    op.add_column(
        'run_records',
        sa.Column(
            'raw_route_geometry',
            Geography(geometry_type='LINESTRING', srid=4326),
            nullable=True,
            comment='Original GPS route before map matching — preserved for reprocessing',
        ),
    )

    # 2. CHECK constraints on run_records
    op.create_check_constraint(
        'ck_run_distance_non_negative',
        'run_records',
        'distance_meters >= 0',
    )
    op.create_check_constraint(
        'ck_run_duration_non_negative',
        'run_records',
        'duration_seconds >= 0',
    )
    op.create_check_constraint(
        'ck_run_finished_after_started',
        'run_records',
        'finished_at IS NULL OR finished_at >= started_at',
    )

    # 3. CHECK constraints on users
    op.create_check_constraint(
        'ck_user_distance_non_negative',
        'users',
        'total_distance_meters >= 0',
    )
    op.create_check_constraint(
        'ck_user_runs_non_negative',
        'users',
        'total_runs >= 0',
    )
    op.create_check_constraint(
        'ck_user_points_non_negative',
        'users',
        'total_points >= 0',
    )

    # 4. Ensure rankings.user_id has ON DELETE CASCADE
    # Drop existing FK and recreate with CASCADE
    op.drop_constraint('rankings_user_id_fkey', 'rankings', type_='foreignkey')
    op.create_foreign_key(
        'rankings_user_id_fkey',
        'rankings',
        'users',
        ['user_id'],
        ['id'],
        ondelete='CASCADE',
    )

    # 5. Replace plain index with partial index on run_records
    # Drop existing composite index if it exists
    op.execute(sa.text('DROP INDEX IF EXISTS idx_runs_user_not_flagged'))
    op.create_index(
        'idx_runs_user_not_flagged',
        'run_records',
        ['user_id'],
        postgresql_where=sa.text('is_flagged = false'),
    )


def downgrade() -> None:
    # 5. Restore original composite index
    op.drop_index('idx_runs_user_not_flagged', table_name='run_records')
    op.create_index(
        'idx_runs_user_not_flagged',
        'run_records',
        ['user_id', 'is_flagged'],
    )

    # 4. Restore FK without explicit CASCADE
    op.drop_constraint('rankings_user_id_fkey', 'rankings', type_='foreignkey')
    op.create_foreign_key(
        'rankings_user_id_fkey',
        'rankings',
        'users',
        ['user_id'],
        ['id'],
    )

    # 3. Drop users CHECK constraints
    op.drop_constraint('ck_user_points_non_negative', 'users', type_='check')
    op.drop_constraint('ck_user_runs_non_negative', 'users', type_='check')
    op.drop_constraint('ck_user_distance_non_negative', 'users', type_='check')

    # 2. Drop run_records CHECK constraints
    op.drop_constraint('ck_run_finished_after_started', 'run_records', type_='check')
    op.drop_constraint('ck_run_duration_non_negative', 'run_records', type_='check')
    op.drop_constraint('ck_run_distance_non_negative', 'run_records', type_='check')

    # 1. Drop raw_route_geometry column
    op.drop_column('run_records', 'raw_route_geometry')

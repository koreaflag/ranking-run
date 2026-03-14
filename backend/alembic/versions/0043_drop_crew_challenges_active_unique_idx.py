"""Drop partial unique index on crew_challenges for active status.

Level-based concurrent challenge limits are now enforced in application code
(CrewChallengeService) instead of a DB-level partial unique constraint.
"""

from alembic import op

revision = '0043'
down_revision = '0042'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index(
        'idx_crew_challenges_active_unique',
        table_name='crew_challenges',
    )


def downgrade() -> None:
    op.create_index(
        'idx_crew_challenges_active_unique',
        'crew_challenges',
        ['crew_id'],
        unique=True,
        postgresql_where="status = 'active'",
    )

"""Add runner_level column to users table.

Individual runner level based on cumulative distance (96 levels, 12 animal tiers).
"""

import sqlalchemy as sa
from alembic import op

revision = '0044'
down_revision = '0043'
branch_labels = None
depends_on = None

# Same thresholds as runner_level_config.py
RUNNER_LEVEL_THRESHOLDS = [
    0, 5_000, 10_000, 15_000, 20_000, 25_000, 30_000, 40_000,
    50_000, 60_000, 70_000, 80_000, 90_000, 100_000, 110_000, 120_000,
    140_000, 160_000, 180_000, 200_000, 220_000, 240_000, 260_000, 280_000,
    320_000, 360_000, 400_000, 440_000, 480_000, 520_000, 560_000, 600_000,
    660_000, 720_000, 780_000, 840_000, 900_000, 960_000, 1_020_000, 1_100_000,
    1_180_000, 1_260_000, 1_340_000, 1_420_000, 1_500_000, 1_580_000, 1_660_000, 1_750_000,
    1_860_000, 1_980_000, 2_100_000, 2_220_000, 2_350_000, 2_480_000, 2_620_000, 2_780_000,
    2_950_000, 3_120_000, 3_300_000, 3_480_000, 3_660_000, 3_850_000, 4_050_000, 4_260_000,
    4_500_000, 4_750_000, 5_000_000, 5_260_000, 5_530_000, 5_810_000, 6_100_000, 6_400_000,
    6_720_000, 7_060_000, 7_400_000, 7_760_000, 8_130_000, 8_510_000, 8_900_000, 9_300_000,
    9_720_000, 10_150_000, 10_600_000, 11_060_000, 11_540_000, 12_030_000, 12_540_000, 13_070_000,
    13_620_000, 14_000_000, 14_400_000, 14_800_000, 15_200_000, 15_600_000, 16_000_000, 16_500_000,
]


def _calc_level(distance: int) -> int:
    for i in range(len(RUNNER_LEVEL_THRESHOLDS) - 1, -1, -1):
        if distance >= RUNNER_LEVEL_THRESHOLDS[i]:
            return i + 1
    return 1


def upgrade() -> None:
    op.add_column('users', sa.Column('runner_level', sa.Integer, server_default='1', nullable=False))

    # Backfill: calculate runner_level from existing total_distance_meters
    conn = op.get_bind()
    rows = conn.execute(sa.text("SELECT id, total_distance_meters FROM users")).fetchall()
    for row in rows:
        level = _calc_level(row[1] or 0)
        if level > 1:
            conn.execute(
                sa.text("UPDATE users SET runner_level = :level WHERE id = :id"),
                {"level": level, "id": row[0]},
            )


def downgrade() -> None:
    op.drop_column('users', 'runner_level')

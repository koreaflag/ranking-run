"""Reverse grade levels: Lv.5=owner(highest), Lv.1=rookie(lowest)."""

import sqlalchemy as sa
from alembic import op

revision = "0035"
down_revision = "0034"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Reverse grade levels: 1→5, 2→4, 3→3, 4→2, 5→1
    op.execute("UPDATE crew_members SET grade_level = 6 - grade_level")

    # Update server_default: new rookie = 1 (was 5)
    op.alter_column(
        "crew_members",
        "grade_level",
        server_default="1",
    )

    # Reverse grade_config JSON keys: "2"→"4", "4"→"2", "5"→"1"
    # Only crews with grade_config need updating
    op.execute("""
        UPDATE crews
        SET grade_config = jsonb_build_object(
            'levels', (
                SELECT jsonb_object_agg(
                    (6 - key::int)::text,
                    value
                )
                FROM jsonb_each(grade_config->'levels')
            )
        )
        WHERE grade_config IS NOT NULL
          AND grade_config->'levels' IS NOT NULL
    """)


def downgrade() -> None:
    # Reverse back
    op.execute("UPDATE crew_members SET grade_level = 6 - grade_level")
    op.alter_column(
        "crew_members",
        "grade_level",
        server_default="5",
    )
    op.execute("""
        UPDATE crews
        SET grade_config = jsonb_build_object(
            'levels', (
                SELECT jsonb_object_agg(
                    (6 - key::int)::text,
                    value
                )
                FROM jsonb_each(grade_config->'levels')
            )
        )
        WHERE grade_config IS NOT NULL
          AND grade_config->'levels' IS NOT NULL
    """)

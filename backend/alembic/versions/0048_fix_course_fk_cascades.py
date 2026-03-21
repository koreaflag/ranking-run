"""Fix course FK cascade settings for deletion support.

Revision ID: 0048
Revises: 0047
Create Date: 2026-03-18
"""
from alembic import op

revision = "0048_fix_course_fk_cascades"
down_revision = "0047"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # run_sessions.course_id: add SET NULL on delete
    op.drop_constraint("run_sessions_course_id_fkey", "run_sessions", type_="foreignkey")
    op.create_foreign_key(
        "run_sessions_course_id_fkey",
        "run_sessions",
        "courses",
        ["course_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # course_streaks.course_id: add CASCADE on delete
    op.drop_constraint("course_streaks_course_id_fkey", "course_streaks", type_="foreignkey")
    op.create_foreign_key(
        "course_streaks_course_id_fkey",
        "course_streaks",
        "courses",
        ["course_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint("run_sessions_course_id_fkey", "run_sessions", type_="foreignkey")
    op.create_foreign_key(
        "run_sessions_course_id_fkey",
        "run_sessions",
        "courses",
        ["course_id"],
        ["id"],
    )

    op.drop_constraint("course_streaks_course_id_fkey", "course_streaks", type_="foreignkey")
    op.create_foreign_key(
        "course_streaks_course_id_fkey",
        "course_streaks",
        "courses",
        ["course_id"],
        ["id"],
    )

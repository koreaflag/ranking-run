"""Add performance indices for common queries

Revision ID: 0012
Revises: 0011
Create Date: 2026-02-19

"""
from typing import Sequence, Union

from alembic import op

revision: str = "0012"
down_revision: Union[str, None] = "0011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Course queries - additional single-column indices
    # (idx_courses_public_created and idx_courses_creator already exist in 0001)
    op.create_index("ix_courses_created_at", "courses", ["created_at"])
    op.create_index("ix_courses_is_public", "courses", ["is_public"])
    op.create_index("ix_courses_distance_meters", "courses", ["distance_meters"])

    # Run records - additional indices
    # (idx_runs_user_finished and idx_runs_course_duration already exist in 0001)
    op.create_index("ix_run_records_course_id", "run_records", ["course_id"])
    op.create_index("ix_run_records_finished_at", "run_records", ["finished_at"])

    # Rankings - leaderboard
    op.create_index("ix_rankings_course_id_rank", "rankings", ["course_id", "rank"])
    op.create_index("ix_rankings_user_id", "rankings", ["user_id"])

    # Refresh tokens - single-column for expires_at
    # (idx_refresh_user compound already exists in 0001)
    op.create_index("ix_refresh_tokens_expires_at", "refresh_tokens", ["expires_at"])

    # Events - date range queries
    op.create_index("ix_events_starts_at", "events", ["starts_at"])
    op.create_index("ix_events_ends_at", "events", ["ends_at"])


def downgrade() -> None:
    op.drop_index("ix_events_ends_at")
    op.drop_index("ix_events_starts_at")
    op.drop_index("ix_refresh_tokens_expires_at")
    op.drop_index("ix_rankings_user_id")
    op.drop_index("ix_rankings_course_id_rank")
    op.drop_index("ix_run_records_finished_at")
    op.drop_index("ix_run_records_course_id")
    op.drop_index("ix_courses_distance_meters")
    op.drop_index("ix_courses_is_public")
    op.drop_index("ix_courses_created_at")

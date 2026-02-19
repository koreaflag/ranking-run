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
    # Course queries - listing, sorting, spatial
    op.create_index("ix_courses_created_at", "courses", ["created_at"])
    op.create_index("ix_courses_is_public", "courses", ["is_public"])
    op.create_index("ix_courses_creator_id", "courses", ["creator_id"])
    op.create_index("ix_courses_distance_meters", "courses", ["distance_meters"])

    # Run records - history, filtering
    op.create_index("ix_run_records_user_id_finished_at", "run_records", ["user_id", "finished_at"])
    op.create_index("ix_run_records_course_id", "run_records", ["course_id"])
    op.create_index("ix_run_records_finished_at", "run_records", ["finished_at"])

    # Rankings - leaderboard
    op.create_index("ix_rankings_course_id_rank", "rankings", ["course_id", "rank"])
    op.create_index("ix_rankings_user_id", "rankings", ["user_id"])

    # Social - follows
    op.create_index("ix_follows_follower_id", "follows", ["follower_id"])
    op.create_index("ix_follows_following_id", "follows", ["following_id"])

    # Reviews
    op.create_index("ix_reviews_course_id", "reviews", ["course_id"])

    # Social accounts - login lookup
    op.create_index("ix_social_accounts_provider_id", "social_accounts", ["provider", "provider_id"])

    # Refresh tokens - validation
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])
    op.create_index("ix_refresh_tokens_expires_at", "refresh_tokens", ["expires_at"])

    # Events
    op.create_index("ix_events_start_date", "events", ["start_date"])
    op.create_index("ix_events_end_date", "events", ["end_date"])

    # Course likes & favorites
    op.create_index("ix_course_likes_course_id", "course_likes", ["course_id"])
    op.create_index("ix_course_favorites_user_id", "course_favorites", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_course_favorites_user_id")
    op.drop_index("ix_course_likes_course_id")
    op.drop_index("ix_events_end_date")
    op.drop_index("ix_events_start_date")
    op.drop_index("ix_refresh_tokens_expires_at")
    op.drop_index("ix_refresh_tokens_user_id")
    op.drop_index("ix_social_accounts_provider_id")
    op.drop_index("ix_reviews_course_id")
    op.drop_index("ix_follows_following_id")
    op.drop_index("ix_follows_follower_id")
    op.drop_index("ix_rankings_user_id")
    op.drop_index("ix_rankings_course_id_rank")
    op.drop_index("ix_run_records_finished_at")
    op.drop_index("ix_run_records_course_id")
    op.drop_index("ix_run_records_user_id_finished_at")
    op.drop_index("ix_courses_distance_meters")
    op.drop_index("ix_courses_creator_id")
    op.drop_index("ix_courses_is_public")
    op.drop_index("ix_courses_created_at")

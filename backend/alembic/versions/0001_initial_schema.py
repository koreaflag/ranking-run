"""Initial schema - all tables for RunCrew

Revision ID: 0001
Revises: None
Create Date: 2026-02-16

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # PostGIS 확장
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    # ── users ──
    op.create_table(
        "users",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("email", sa.String(255)),
        sa.Column("nickname", sa.String(12)),
        sa.Column("avatar_url", sa.Text()),
        sa.Column("total_distance_meters", sa.BigInteger(), server_default="0"),
        sa.Column("total_runs", sa.Integer(), server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )
    op.create_index("idx_users_nickname", "users", ["nickname"], unique=True)

    # ── social_accounts ──
    op.create_table(
        "social_accounts",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("provider", sa.String(20), nullable=False),
        sa.Column("provider_id", sa.String(255), nullable=False),
        sa.Column("provider_email", sa.String(255)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )
    op.create_index("idx_social_provider", "social_accounts", ["provider", "provider_id"], unique=True)

    # ── refresh_tokens ──
    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(255), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_revoked", sa.Boolean(), server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )
    op.create_index("idx_refresh_user", "refresh_tokens", ["user_id", "is_revoked"])

    # ── courses ──
    op.create_table(
        "courses",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("creator_id", sa.UUID(), sa.ForeignKey("users.id")),
        sa.Column("run_record_id", sa.UUID()),
        sa.Column("title", sa.String(30), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("distance_meters", sa.Integer(), nullable=False),
        sa.Column("estimated_duration_seconds", sa.Integer()),
        sa.Column("elevation_gain_meters", sa.Integer(), server_default="0"),
        sa.Column("elevation_profile", sa.JSON()),
        sa.Column("thumbnail_url", sa.Text()),
        sa.Column("is_public", sa.Boolean(), server_default="true"),
        sa.Column("tags", sa.ARRAY(sa.Text()), server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )
    # PostGIS 컬럼은 raw SQL로 추가 (Alembic op에서 GEOGRAPHY 타입 미지원)
    op.execute("ALTER TABLE courses ADD COLUMN route_geometry GEOGRAPHY(LINESTRING, 4326)")
    op.execute("ALTER TABLE courses ADD COLUMN start_point GEOGRAPHY(POINT, 4326)")
    op.execute("CREATE INDEX idx_courses_start_point ON courses USING GIST(start_point)")
    op.create_index("idx_courses_public_created", "courses", ["is_public", sa.text("created_at DESC")])
    op.create_index("idx_courses_creator", "courses", ["creator_id"])

    # ── run_sessions ──
    op.create_table(
        "run_sessions",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("course_id", sa.UUID(), sa.ForeignKey("courses.id")),
        sa.Column("status", sa.String(20), server_default="active"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("device_info", sa.JSON()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )

    # ── run_chunks ──
    op.create_table(
        "run_chunks",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("session_id", sa.UUID(), sa.ForeignKey("run_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("chunk_type", sa.String(20), nullable=False),
        sa.Column("raw_gps_points", sa.JSON(), nullable=False),
        sa.Column("filtered_points", sa.JSON()),
        sa.Column("chunk_summary", sa.JSON(), nullable=False),
        sa.Column("cumulative", sa.JSON(), nullable=False),
        sa.Column("completed_splits", sa.JSON(), server_default="'[]'"),
        sa.Column("pause_intervals", sa.JSON(), server_default="'[]'"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )
    op.create_index("idx_chunks_session_seq", "run_chunks", ["session_id", "sequence"], unique=True)

    # ── run_records ──
    op.create_table(
        "run_records",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("session_id", sa.UUID(), sa.ForeignKey("run_sessions.id")),
        sa.Column("course_id", sa.UUID(), sa.ForeignKey("courses.id")),
        sa.Column("distance_meters", sa.Integer(), nullable=False),
        sa.Column("duration_seconds", sa.Integer(), nullable=False),
        sa.Column("total_elapsed_seconds", sa.Integer()),
        sa.Column("avg_pace_seconds_per_km", sa.Integer()),
        sa.Column("best_pace_seconds_per_km", sa.Integer()),
        sa.Column("avg_speed_ms", sa.Float()),
        sa.Column("max_speed_ms", sa.Float()),
        sa.Column("calories", sa.Integer()),
        sa.Column("elevation_gain_meters", sa.Integer(), server_default="0"),
        sa.Column("elevation_loss_meters", sa.Integer(), server_default="0"),
        sa.Column("elevation_profile", sa.JSON()),
        sa.Column("splits", sa.JSON()),
        sa.Column("pause_intervals", sa.JSON(), server_default="'[]'"),
        sa.Column("filter_config", sa.JSON()),
        sa.Column("course_completed", sa.Boolean()),
        sa.Column("route_match_percent", sa.Float()),
        sa.Column("max_deviation_meters", sa.Float()),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )
    op.execute("ALTER TABLE run_records ADD COLUMN route_geometry GEOGRAPHY(LINESTRING, 4326)")
    op.create_index("idx_runs_user_finished", "run_records", ["user_id", sa.text("finished_at DESC")])
    op.create_index("idx_runs_course_duration", "run_records", ["course_id", sa.text("duration_seconds ASC")])

    # courses.run_record_id FK (순환 참조 해결: run_records 생성 후 추가)
    op.create_foreign_key("fk_courses_run_record", "courses", "run_records", ["run_record_id"], ["id"])

    # ── course_stats ──
    op.create_table(
        "course_stats",
        sa.Column("course_id", sa.UUID(), sa.ForeignKey("courses.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("total_runs", sa.Integer(), server_default="0"),
        sa.Column("unique_runners", sa.Integer(), server_default="0"),
        sa.Column("avg_duration_seconds", sa.Integer()),
        sa.Column("avg_pace_seconds_per_km", sa.Integer()),
        sa.Column("best_duration_seconds", sa.Integer()),
        sa.Column("best_pace_seconds_per_km", sa.Integer()),
        sa.Column("completion_rate", sa.Float(), server_default="0"),
        sa.Column("runs_by_hour", sa.JSON(), server_default="'{}'"),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )

    # ── rankings ──
    op.create_table(
        "rankings",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("course_id", sa.UUID(), sa.ForeignKey("courses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("best_duration_seconds", sa.Integer(), nullable=False),
        sa.Column("best_pace_seconds_per_km", sa.Integer(), nullable=False),
        sa.Column("run_count", sa.Integer(), server_default="1"),
        sa.Column("rank", sa.Integer()),
        sa.Column("achieved_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )
    op.create_index("idx_rankings_course_user", "rankings", ["course_id", "user_id"], unique=True)
    op.create_index("idx_rankings_course_duration", "rankings", ["course_id", sa.text("best_duration_seconds ASC")])


def downgrade() -> None:
    op.drop_table("rankings")
    op.drop_table("course_stats")
    op.drop_constraint("fk_courses_run_record", "courses", type_="foreignkey")
    op.drop_table("run_records")
    op.drop_table("run_chunks")
    op.drop_table("run_sessions")
    op.drop_table("courses")
    op.drop_table("refresh_tokens")
    op.drop_table("social_accounts")
    op.drop_table("users")
    op.execute("DROP EXTENSION IF EXISTS postgis")

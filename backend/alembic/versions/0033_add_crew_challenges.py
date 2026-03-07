"""Add crew_challenges, crew_challenge_records, and crew_course_rankings tables."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0033"
down_revision = "0032"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # crew_challenges table
    op.create_table(
        "crew_challenges",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            primary_key=True,
        ),
        sa.Column(
            "crew_id",
            UUID(as_uuid=True),
            sa.ForeignKey("crews.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "course_id",
            UUID(as_uuid=True),
            sa.ForeignKey("courses.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_by",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default="active",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "ended_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    # Partial unique index: one active challenge per crew
    op.create_index(
        "idx_crew_challenges_active_unique",
        "crew_challenges",
        ["crew_id"],
        unique=True,
        postgresql_where=sa.text("status = 'active'"),
    )
    op.create_index(
        "idx_crew_challenges_crew_status",
        "crew_challenges",
        ["crew_id", "status"],
    )
    op.create_index(
        "idx_crew_challenges_course",
        "crew_challenges",
        ["course_id"],
    )

    # crew_challenge_records table
    op.create_table(
        "crew_challenge_records",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            primary_key=True,
        ),
        sa.Column(
            "challenge_id",
            UUID(as_uuid=True),
            sa.ForeignKey("crew_challenges.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("best_duration_seconds", sa.Integer(), nullable=True),
        sa.Column("best_pace_seconds_per_km", sa.Integer(), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "run_count",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.create_unique_constraint(
        "uq_crew_challenge_record_user",
        "crew_challenge_records",
        ["challenge_id", "user_id"],
    )
    op.create_index(
        "idx_crew_challenge_records_user",
        "crew_challenge_records",
        ["user_id"],
    )

    # crew_course_rankings table
    op.create_table(
        "crew_course_rankings",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            primary_key=True,
        ),
        sa.Column(
            "course_id",
            UUID(as_uuid=True),
            sa.ForeignKey("courses.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "crew_id",
            UUID(as_uuid=True),
            sa.ForeignKey("crews.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "crew_challenge_id",
            UUID(as_uuid=True),
            sa.ForeignKey("crew_challenges.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("crew_name", sa.String(100), nullable=False),
        sa.Column("avg_duration_seconds", sa.Integer(), nullable=False),
        sa.Column(
            "completed_count",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "total_participants",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column("rank", sa.Integer(), nullable=True),
        sa.Column(
            "achieved_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_unique_constraint(
        "uq_crew_course_ranking",
        "crew_course_rankings",
        ["course_id", "crew_id"],
    )
    op.create_index(
        "idx_crew_course_rankings_course_avg",
        "crew_course_rankings",
        ["course_id", "avg_duration_seconds"],
    )


def downgrade() -> None:
    op.drop_index("idx_crew_course_rankings_course_avg")
    op.drop_constraint("uq_crew_course_ranking", "crew_course_rankings")
    op.drop_table("crew_course_rankings")

    op.drop_index("idx_crew_challenge_records_user")
    op.drop_constraint("uq_crew_challenge_record_user", "crew_challenge_records")
    op.drop_table("crew_challenge_records")

    op.drop_index("idx_crew_challenges_course")
    op.drop_index("idx_crew_challenges_crew_status")
    op.drop_index("idx_crew_challenges_active_unique")
    op.drop_table("crew_challenges")

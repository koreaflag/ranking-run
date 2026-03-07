"""Add group_runs, group_run_members, and group_rankings tables."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0032"
down_revision = "0031"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # group_runs table
    op.create_table(
        "group_runs",
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
        sa.Column("name", sa.String(30), nullable=False),
        sa.Column(
            "creator_id",
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
            "member_count",
            sa.Integer(),
            nullable=False,
            server_default="1",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "idx_group_runs_course_status",
        "group_runs",
        ["course_id", "status"],
    )
    op.create_index(
        "idx_group_runs_creator",
        "group_runs",
        ["creator_id"],
    )

    # group_run_members table
    op.create_table(
        "group_run_members",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            primary_key=True,
        ),
        sa.Column(
            "group_run_id",
            UUID(as_uuid=True),
            sa.ForeignKey("group_runs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default="invited",
        ),
        sa.Column("best_duration_seconds", sa.Integer(), nullable=True),
        sa.Column("best_pace_seconds_per_km", sa.Integer(), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "joined_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_unique_constraint(
        "uq_group_run_member",
        "group_run_members",
        ["group_run_id", "user_id"],
    )
    op.create_index(
        "idx_group_run_members_user",
        "group_run_members",
        ["user_id"],
    )

    # group_rankings table
    op.create_table(
        "group_rankings",
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
            "group_run_id",
            UUID(as_uuid=True),
            sa.ForeignKey("group_runs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("group_name", sa.String(30), nullable=False),
        sa.Column("avg_duration_seconds", sa.Integer(), nullable=False),
        sa.Column(
            "completed_count",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "total_members",
            sa.Integer(),
            nullable=False,
            server_default="1",
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
        "uq_group_ranking_course_group",
        "group_rankings",
        ["course_id", "group_run_id"],
    )
    op.create_index(
        "idx_group_rankings_course_avg",
        "group_rankings",
        ["course_id", "avg_duration_seconds"],
    )


def downgrade() -> None:
    op.drop_index("idx_group_rankings_course_avg")
    op.drop_constraint("uq_group_ranking_course_group", "group_rankings")
    op.drop_table("group_rankings")

    op.drop_index("idx_group_run_members_user")
    op.drop_constraint("uq_group_run_member", "group_run_members")
    op.drop_table("group_run_members")

    op.drop_index("idx_group_runs_creator")
    op.drop_index("idx_group_runs_course_status")
    op.drop_table("group_runs")

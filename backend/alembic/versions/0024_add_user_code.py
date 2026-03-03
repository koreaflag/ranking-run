"""Add user_code field to users table.

Revision ID: 0024
Revises: 0023
"""

import random

from alembic import op
import sqlalchemy as sa

revision = "0024"
down_revision = "0023"
branch_labels = None
depends_on = None


def _generate_code() -> str:
    return str(random.randint(10000, 99999))


def upgrade() -> None:
    # 1) Add column as nullable first
    op.add_column("users", sa.Column("user_code", sa.String(8), nullable=True))

    # 2) Backfill existing rows with unique codes
    conn = op.get_bind()
    rows = conn.execute(sa.text("SELECT id FROM users WHERE user_code IS NULL")).fetchall()
    used_codes: set[str] = set()
    for row in rows:
        code = _generate_code()
        while code in used_codes:
            code = _generate_code()
        used_codes.add(code)
        conn.execute(
            sa.text("UPDATE users SET user_code = :code WHERE id = :uid"),
            {"code": code, "uid": row[0]},
        )

    # 3) Set NOT NULL and unique index
    op.alter_column("users", "user_code", nullable=False)
    op.create_unique_constraint("uq_users_user_code", "users", ["user_code"])
    op.create_index("ix_users_user_code", "users", ["user_code"])


def downgrade() -> None:
    op.drop_index("ix_users_user_code", table_name="users")
    op.drop_constraint("uq_users_user_code", "users", type_="unique")
    op.drop_column("users", "user_code")

"""Add raw_route_geometry column to courses for storing original GPS trace

Revision ID: 0017
Revises: 0016
Create Date: 2026-02-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from geoalchemy2 import Geography

revision: str = "0017"
down_revision: Union[str, None] = "0016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "courses",
        sa.Column("raw_route_geometry", Geography(geometry_type="LINESTRING", srid=4326), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("courses", "raw_route_geometry")

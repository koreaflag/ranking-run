"""Heatmap endpoint: aggregated run density data within a viewport."""

from fastapi import APIRouter, Query
from sqlalchemy import text

from app.core.deps import DbSession

router = APIRouter(prefix="/heatmap", tags=["heatmap"])

# Grid cell size in degrees (roughly 50 m at mid-latitudes)
_GRID_SIZE_DEG = 0.00045


@router.get("", response_model=list[dict])
async def get_heatmap_data(
    db: DbSession,
    sw_lat: float = Query(..., ge=-90, le=90),
    sw_lng: float = Query(..., ge=-180, le=180),
    ne_lat: float = Query(..., ge=-90, le=90),
    ne_lng: float = Query(..., ge=-180, le=180),
    limit: int = Query(5000, ge=1, le=10000),
) -> list[dict]:
    """Return aggregated heatmap points from run records within a viewport.

    The algorithm:
    1. Find run records whose route_geometry intersects the viewport.
    2. Extract individual points from each LineString via ST_DumpPoints.
    3. Snap each point to a ~50 m grid cell and aggregate into (lat, lng, weight).
    4. Return the grid centroids with their runner count as weight.

    The grid size (~0.00045 degrees) approximates 50 m at mid-latitudes,
    which gives a visually meaningful heatmap without overwhelming the client.
    """
    grid_size = _GRID_SIZE_DEG

    # Raw SQL is clearer for this PostGIS-heavy aggregation pipeline.
    # Steps:
    #   - Filter run_records by bounding box (ST_Intersects)
    #   - Dump all points from each LineString
    #   - Keep only points inside the viewport
    #   - Snap to grid cells using floor(coord / grid_size) * grid_size
    #   - Count distinct run_record_ids per cell as weight
    query = text("""
        WITH viewport_records AS (
            SELECT id, route_geometry
            FROM run_records
            WHERE route_geometry IS NOT NULL
              AND ST_Intersects(
                  route_geometry,
                  ST_MakeEnvelope(:sw_lng, :sw_lat, :ne_lng, :ne_lat, 4326)::geography
              )
            LIMIT 500
        ),
        dumped_points AS (
            SELECT
                vr.id AS record_id,
                ST_Y((dp.geom)::geometry) AS pt_lat,
                ST_X((dp.geom)::geometry) AS pt_lng
            FROM viewport_records vr,
                 LATERAL ST_DumpPoints(vr.route_geometry::geometry) AS dp
        ),
        filtered_points AS (
            SELECT record_id, pt_lat, pt_lng
            FROM dumped_points
            WHERE pt_lat BETWEEN :sw_lat AND :ne_lat
              AND pt_lng BETWEEN :sw_lng AND :ne_lng
        ),
        grid_cells AS (
            SELECT
                floor(pt_lat / :grid_size) * :grid_size + :grid_size / 2.0 AS cell_lat,
                floor(pt_lng / :grid_size) * :grid_size + :grid_size / 2.0 AS cell_lng,
                COUNT(DISTINCT record_id) AS weight
            FROM filtered_points
            GROUP BY
                floor(pt_lat / :grid_size),
                floor(pt_lng / :grid_size)
        )
        SELECT
            round(cell_lat::numeric, 6) AS lat,
            round(cell_lng::numeric, 6) AS lng,
            weight
        FROM grid_cells
        ORDER BY weight DESC
        LIMIT :limit
    """)

    result = await db.execute(
        query,
        {
            "sw_lat": sw_lat,
            "sw_lng": sw_lng,
            "ne_lat": ne_lat,
            "ne_lng": ne_lng,
            "grid_size": grid_size,
            "limit": limit,
        },
    )
    rows = result.all()

    return [
        {
            "lat": float(row.lat),
            "lng": float(row.lng),
            "weight": int(row.weight),
        }
        for row in rows
    ]

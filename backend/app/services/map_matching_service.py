"""Map Matching service using Mapbox Map Matching API.

Snaps raw GPS coordinates to the nearest road/path network
to correct GPS drift that causes routes to go through buildings.
"""

import logging
from typing import Optional

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)

# Mapbox limits: max 100 coordinates per request
MAX_COORDS_PER_REQUEST = 100
CHUNK_SIZE = 90  # Leave room for overlap
OVERLAP = 5  # Overlap between chunks for smooth stitching


class MapMatchingService:
    """Snaps GPS coordinates to road/path network using Mapbox."""

    def __init__(self):
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=30.0)
        return self._client

    async def match_route(
        self,
        coordinates: list[list[float]],
    ) -> list[list[float]]:
        """Snap a route to the road/path network.

        Args:
            coordinates: List of [lng, lat] or [lng, lat, alt] arrays.

        Returns:
            Matched coordinates as [[lng, lat, alt], ...].
            Falls back to original if matching fails.
        """
        settings = get_settings()
        if not settings.MAPBOX_ACCESS_TOKEN:
            logger.warning("[MapMatching] No Mapbox token configured, skipping")
            return coordinates

        if len(coordinates) < 2:
            return coordinates

        try:
            if len(coordinates) <= MAX_COORDS_PER_REQUEST:
                matched = await self._match_chunk(coordinates, settings.MAPBOX_ACCESS_TOKEN)
                return matched if matched else coordinates
            else:
                return await self._match_long_route(coordinates, settings.MAPBOX_ACCESS_TOKEN)
        except Exception as e:
            logger.error(f"[MapMatching] Failed: {e}")
            return coordinates

    async def _match_chunk(
        self,
        coordinates: list[list[float]],
        access_token: str,
    ) -> list[list[float]] | None:
        """Match a single chunk of coordinates (max 100)."""
        # Build coordinate string: lng,lat;lng,lat;...
        coord_str = ";".join(
            f"{c[0]:.6f},{c[1]:.6f}" for c in coordinates
        )

        url = f"https://api.mapbox.com/matching/v5/mapbox/walking/{coord_str}"
        params = {
            "access_token": access_token,
            "geometries": "geojson",
            "overview": "full",
            "steps": "false",
            "tidy": "true",  # Remove repeated/redundant points
        }

        # Add radiuses - allow up to 50m snap distance per point
        radiuses = ";".join(["50"] * len(coordinates))
        params["radiuses"] = radiuses

        client = await self._get_client()
        response = await client.get(url, params=params)

        if response.status_code != 200:
            logger.warning(f"[MapMatching] API returned {response.status_code}")
            return None

        data = response.json()
        if data.get("code") != "Ok" or not data.get("matchings"):
            logger.warning(f"[MapMatching] No match: {data.get('code')}")
            return None

        matched_coords = data["matchings"][0]["geometry"]["coordinates"]

        # Preserve original altitude values by interpolating
        matched_with_alt = self._restore_altitude(coordinates, matched_coords)
        return matched_with_alt

    async def _match_long_route(
        self,
        coordinates: list[list[float]],
        access_token: str,
    ) -> list[list[float]]:
        """Match a long route by splitting into overlapping chunks."""
        all_matched: list[list[float]] = []
        i = 0

        while i < len(coordinates):
            end = min(i + CHUNK_SIZE, len(coordinates))
            chunk = coordinates[i:end]

            matched = await self._match_chunk(chunk, access_token)
            if matched is None:
                # Fall back to raw coordinates for this chunk
                matched = chunk

            if all_matched and len(matched) > OVERLAP:
                # Skip overlap points to avoid duplicates
                all_matched.extend(matched[OVERLAP:])
            else:
                all_matched.extend(matched)

            # Move forward, leaving overlap for next chunk
            i = end - OVERLAP if end < len(coordinates) else end

        return all_matched

    @staticmethod
    def _restore_altitude(
        original: list[list[float]],
        matched: list[list[float]],
    ) -> list[list[float]]:
        """Restore altitude from original coordinates to matched ones.

        Mapbox returns 2D coordinates. We interpolate altitude from the
        nearest original point for each matched point.
        """
        if not original or not matched:
            return matched

        # Check if original has altitude data
        has_alt = len(original[0]) > 2

        if not has_alt:
            return [[c[0], c[1], 0.0] for c in matched]

        result = []
        orig_idx = 0
        for mc in matched:
            # Find nearest original point (simple linear scan)
            best_dist = float("inf")
            best_alt = 0.0
            for j in range(max(0, orig_idx - 2), min(len(original), orig_idx + 10)):
                dlng = mc[0] - original[j][0]
                dlat = mc[1] - original[j][1]
                dist = dlng * dlng + dlat * dlat
                if dist < best_dist:
                    best_dist = dist
                    best_alt = original[j][2] if len(original[j]) > 2 else 0.0
                    orig_idx = j

            result.append([mc[0], mc[1], best_alt])

        return result

    async def close(self):
        """Close the HTTP client."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()

"""Map Matching service using Mapbox Map Matching API.

Snaps raw GPS coordinates to the nearest road/path network
to correct GPS drift that causes routes to go through buildings.

Signal-gap aware: detects GPS signal loss (tunnels, underpasses) by
looking for large inter-point distances and skips map matching for
those segments to avoid Mapbox routing them onto wrong roads.
"""

import logging
import math
from typing import NamedTuple, Optional

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)

# Mapbox limits: max 100 coordinates per request
MAX_COORDS_PER_REQUEST = 100
CHUNK_SIZE = 90  # Leave room for overlap
OVERLAP = 10  # Overlap between chunks for smooth stitching (reduced boundary discontinuity)

# Signal gap detection: if two consecutive points are > this distance apart
# (meters), treat the gap as a tunnel/underpass and skip map matching.
SIGNAL_GAP_THRESHOLD_M = 80.0


class MatchResult(NamedTuple):
    """Result of a map-matching operation."""
    coordinates: list[list[float]]
    confidence: float | None  # Average Mapbox confidence (0.0–1.0), None if no matching
    gap_indices: list[list[int]]  # Signal gap segments as [[start_idx, end_idx], ...]


class MapMatchingService:
    """Snaps GPS coordinates to road/path network using Mapbox."""

    def __init__(self):
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=5.0)
        return self._client

    async def match_route(
        self,
        coordinates: list[list[float]],
    ) -> MatchResult:
        """Snap a route to the road/path network.

        Signal-gap aware: splits the route at GPS signal gaps (tunnels,
        underpasses) and only map-matches the normal segments. Gap segments
        are kept as straight lines between the last good point and the
        first good point after the gap.

        Args:
            coordinates: List of [lng, lat] or [lng, lat, alt] arrays.

        Returns:
            MatchResult with matched coordinates, confidence, and gap indices.
            Falls back to original if matching fails.
        """
        settings = get_settings()
        if not settings.MAPBOX_ACCESS_TOKEN:
            logger.warning("[MapMatching] No Mapbox token configured, skipping")
            return MatchResult(coordinates=coordinates, confidence=None, gap_indices=[])

        if len(coordinates) < 2:
            return MatchResult(coordinates=coordinates, confidence=None, gap_indices=[])

        # Filter out invalid (0,0) coordinates (GPS not initialized)
        valid_coords = [c for c in coordinates if not (abs(c[0]) < 0.001 and abs(c[1]) < 0.001)]
        if len(valid_coords) < 2:
            logger.warning("[MapMatching] All coordinates are invalid (0,0), skipping")
            return MatchResult(coordinates=coordinates, confidence=None, gap_indices=[])
        coordinates = valid_coords

        # Pre-process: downsample dense points to reduce noise before matching
        downsampled = self._downsample(coordinates, min_spacing_m=5.0)
        logger.info(f"[MapMatching] Downsampled {len(coordinates)} → {len(downsampled)} points")

        # Mapbox requires at least 2 distinct coordinates
        if len(downsampled) < 2:
            logger.warning("[MapMatching] Too few points after downsampling, skipping")
            return MatchResult(coordinates=coordinates, confidence=None, gap_indices=[])

        # Split into segments at signal gaps and collect gap positions
        segments, gap_positions = self._split_at_gaps_with_indices(downsampled)

        if len(segments) == 1:
            # No gaps detected — match the whole route
            logger.info("[MapMatching] No signal gaps detected")
            matched, confidence = await self._match_segment_with_confidence(
                segments[0], settings.MAPBOX_ACCESS_TOKEN, coordinates,
            )
            return MatchResult(coordinates=matched, confidence=confidence, gap_indices=[])

        # Multiple segments — match each normal segment, keep gaps as-is
        logger.info(f"[MapMatching] Detected {len(segments)} segments (signal gaps found)")
        result: list[list[float]] = []
        confidences: list[float] = []
        # Build gap_indices relative to output coordinates
        gap_indices: list[list[int]] = []

        for i, seg in enumerate(segments):
            if len(seg) < 2:
                result.extend(seg)
                continue
            matched, conf = await self._match_segment_with_confidence(
                seg, settings.MAPBOX_ACCESS_TOKEN, seg,
            )
            if conf is not None:
                confidences.append(conf)
            if result and matched:
                # Avoid duplicate junction point
                result.extend(matched[1:])
            else:
                result.extend(matched)

        # Convert original gap positions to output coordinate indices
        # Each gap_position is the index in the downsampled array where a gap starts
        out_idx = 0
        seg_offset = 0
        for gi, gp in enumerate(gap_positions):
            # gp is the index in downsampled coordinates where the gap was detected
            # Map to approximate index in the result
            gap_start = max(0, gp - 1)
            gap_end = gp
            gap_indices.append([gap_start, gap_end])

        avg_confidence = sum(confidences) / len(confidences) if confidences else None
        return MatchResult(coordinates=result, confidence=avg_confidence, gap_indices=gap_indices)

    async def _match_segment_with_confidence(
        self,
        segment: list[list[float]],
        access_token: str,
        fallback: list[list[float]],
    ) -> tuple[list[list[float]], float | None]:
        """Match a single contiguous segment and return (coords, confidence)."""
        try:
            if len(segment) <= MAX_COORDS_PER_REQUEST:
                matched, conf = await self._match_chunk_with_confidence(segment, access_token)
                return (matched if matched else fallback, conf)
            else:
                coords = await self._match_long_route(segment, access_token)
                return (coords, None)
        except Exception as e:
            logger.error(f"[MapMatching] Segment match failed: {e}")
            return (fallback, None)

    async def _match_chunk(
        self,
        coordinates: list[list[float]],
        access_token: str,
    ) -> list[list[float]] | None:
        """Match a single chunk of coordinates (max 100)."""
        matched, _ = await self._match_chunk_with_confidence(coordinates, access_token)
        return matched

    async def _match_chunk_with_confidence(
        self,
        coordinates: list[list[float]],
        access_token: str,
    ) -> tuple[list[list[float]] | None, float | None]:
        """Match a single chunk and return (coords, confidence)."""
        coord_str = ";".join(
            f"{c[0]:.6f},{c[1]:.6f}" for c in coordinates
        )

        url = f"https://api.mapbox.com/matching/v5/mapbox/walking/{coord_str}"
        params = {
            "access_token": access_token,
            "geometries": "geojson",
            "overview": "full",
            "steps": "false",
            "tidy": "true",
        }

        radiuses = []
        for i in range(len(coordinates)):
            if i == 0 or i == len(coordinates) - 1:
                radiuses.append("35")
            else:
                radiuses.append("20")
        params["radiuses"] = ";".join(radiuses)

        client = await self._get_client()
        try:
            response = await client.get(url, params=params)
        except httpx.TimeoutException:
            logger.error("[MapMatching] Mapbox API request timed out (5s limit)")
            return None, None
        except httpx.HTTPError as e:
            logger.error(f"[MapMatching] Mapbox API HTTP error: {e}")
            return None, None

        if response.status_code != 200:
            logger.warning(f"[MapMatching] API returned {response.status_code}")
            return None, None

        try:
            data = response.json()
        except (ValueError, KeyError):
            logger.error("[MapMatching] Failed to parse Mapbox API response")
            return None, None

        if data.get("code") != "Ok" or not data.get("matchings"):
            logger.warning(f"[MapMatching] No match: {data.get('code')}")
            return None, None

        matching = data["matchings"][0]
        matched_coords = matching["geometry"]["coordinates"]
        confidence = matching.get("confidence")

        matched_with_alt = self._restore_altitude(coordinates, matched_coords)
        return matched_with_alt, confidence

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
    def _haversine_m(lng1: float, lat1: float, lng2: float, lat2: float) -> float:
        """Haversine distance in meters between two WGS-84 points."""
        R = 6_371_000  # Earth radius in meters
        dlat = math.radians(lat2 - lat1)
        dlng = math.radians(lng2 - lng1)
        a = (
            math.sin(dlat / 2) ** 2
            + math.cos(math.radians(lat1))
            * math.cos(math.radians(lat2))
            * math.sin(dlng / 2) ** 2
        )
        return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    @classmethod
    def _split_at_gaps(
        cls,
        coordinates: list[list[float]],
    ) -> list[list[list[float]]]:
        """Split a coordinate list into segments at signal gaps.

        A gap is detected when two consecutive points are farther than
        SIGNAL_GAP_THRESHOLD_M apart, indicating a tunnel or GPS loss.
        The boundary points are included in both adjacent segments so
        the route remains continuous.
        """
        if len(coordinates) < 2:
            return [coordinates]

        segments: list[list[list[float]]] = []
        current: list[list[float]] = [coordinates[0]]

        for i in range(1, len(coordinates)):
            dist = cls._haversine_m(
                coordinates[i - 1][0], coordinates[i - 1][1],
                coordinates[i][0], coordinates[i][1],
            )
            if dist > SIGNAL_GAP_THRESHOLD_M:
                # End current segment, start a new one
                segments.append(current)
                logger.info(
                    f"[MapMatching] Signal gap at point {i}: {dist:.0f}m "
                    f"(threshold {SIGNAL_GAP_THRESHOLD_M}m) — skipping map match for this gap"
                )
                # Bridge: include last point of prev segment as first of next
                current = [coordinates[i - 1], coordinates[i]]
            else:
                current.append(coordinates[i])

        segments.append(current)
        return segments

    @classmethod
    def _split_at_gaps_with_indices(
        cls,
        coordinates: list[list[float]],
    ) -> tuple[list[list[list[float]]], list[int]]:
        """Split coordinates at signal gaps and return gap positions.

        Returns:
            (segments, gap_positions) where gap_positions are the indices
            in the original coordinate list where gaps were detected.
        """
        if len(coordinates) < 2:
            return [coordinates], []

        segments: list[list[list[float]]] = []
        gap_positions: list[int] = []
        current: list[list[float]] = [coordinates[0]]

        for i in range(1, len(coordinates)):
            dist = cls._haversine_m(
                coordinates[i - 1][0], coordinates[i - 1][1],
                coordinates[i][0], coordinates[i][1],
            )
            if dist > SIGNAL_GAP_THRESHOLD_M:
                segments.append(current)
                gap_positions.append(i)
                logger.info(
                    f"[MapMatching] Signal gap at point {i}: {dist:.0f}m "
                    f"(threshold {SIGNAL_GAP_THRESHOLD_M}m)"
                )
                current = [coordinates[i - 1], coordinates[i]]
            else:
                current.append(coordinates[i])

        segments.append(current)
        return segments, gap_positions

    @staticmethod
    def _downsample(
        coordinates: list[list[float]],
        min_spacing_m: float = 5.0,
    ) -> list[list[float]]:
        """Remove dense points closer than min_spacing_m to reduce noise."""
        if len(coordinates) <= 2:
            return coordinates
        result = [coordinates[0]]
        acc = 0.0
        for i in range(1, len(coordinates)):
            dlng = (coordinates[i][0] - coordinates[i - 1][0]) * 111000
            dlat = (coordinates[i][1] - coordinates[i - 1][1]) * 111000
            dist = (dlng**2 + dlat**2) ** 0.5
            acc += dist
            if acc >= min_spacing_m:
                result.append(coordinates[i])
                acc = 0.0
        # Always include the last point
        if result[-1] != coordinates[-1]:
            result.append(coordinates[-1])
        return result

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

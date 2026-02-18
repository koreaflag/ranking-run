"""File parser service: GPX and FIT file parsing into normalized run data."""

import math
from dataclasses import dataclass, field
from datetime import datetime
from typing import Sequence

import gpxpy
import gpxpy.gpx
from fitparse import FitFile


@dataclass
class TrackPoint:
    """A single GPS track point."""
    lat: float
    lng: float
    alt: float = 0.0
    timestamp: datetime | None = None
    speed: float | None = None  # m/s
    heart_rate: int | None = None


@dataclass
class ParsedSplit:
    """Per-km split data."""
    split_number: int
    distance_meters: float
    duration_seconds: int
    pace_seconds_per_km: int
    elevation_change_meters: float = 0.0


@dataclass
class ParsedActivity:
    """Normalized activity data from any file format."""
    points: list[TrackPoint] = field(default_factory=list)
    distance_meters: int = 0
    duration_seconds: int = 0
    total_elapsed_seconds: int = 0
    avg_pace_seconds_per_km: int | None = None
    best_pace_seconds_per_km: int | None = None
    avg_speed_ms: float | None = None
    max_speed_ms: float | None = None
    elevation_gain_meters: int = 0
    elevation_loss_meters: int = 0
    splits: list[ParsedSplit] = field(default_factory=list)
    elevation_profile: list[float] = field(default_factory=list)
    route_coordinates: list[list[float]] = field(default_factory=list)  # [[lng, lat, alt], ...]
    started_at: datetime | None = None
    finished_at: datetime | None = None
    source_device: str | None = None
    activity_type: str = "running"


# Earth radius in meters
EARTH_RADIUS = 6371000.0

# Elevation noise threshold (meters) - ignore changes smaller than this
ELEVATION_THRESHOLD = 2.0


def _haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Calculate great-circle distance between two points in meters."""
    lat1_r, lat2_r = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1_r) * math.cos(lat2_r) * math.sin(dlng / 2) ** 2
    return EARTH_RADIUS * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _calculate_elevation(points: Sequence[TrackPoint]) -> tuple[int, int]:
    """Calculate total elevation gain and loss with noise filtering.

    Uses a threshold to ignore small altitude fluctuations caused by GPS noise.
    Only updates the reference altitude when the change exceeds the threshold,
    preventing accumulation of sensor jitter.
    """
    gain = 0.0
    loss = 0.0
    prev_alt = None

    for pt in points:
        if pt.alt is None or pt.alt == 0.0:
            continue
        if prev_alt is not None:
            diff = pt.alt - prev_alt
            if abs(diff) >= ELEVATION_THRESHOLD:
                if diff > 0:
                    gain += diff
                else:
                    loss += abs(diff)
                prev_alt = pt.alt
        else:
            prev_alt = pt.alt

    return int(gain), int(loss)


def _build_splits(points: list[TrackPoint]) -> list[ParsedSplit]:
    """Calculate per-km splits from ordered trackpoints.

    Walks through consecutive points, accumulating haversine distance.
    Each time cumulative distance crosses a 1 km boundary a split is emitted
    with the elapsed time and elevation delta for that segment.
    """
    if len(points) < 2:
        return []

    splits: list[ParsedSplit] = []
    split_number = 1
    split_start_idx = 0
    cumulative_distance = 0.0
    split_start_distance = 0.0

    for i in range(1, len(points)):
        d = _haversine(
            points[i - 1].lat, points[i - 1].lng,
            points[i].lat, points[i].lng,
        )
        cumulative_distance += d

        if cumulative_distance - split_start_distance >= 1000.0:
            split_start_time = points[split_start_idx].timestamp
            split_end_time = points[i].timestamp

            if split_start_time and split_end_time:
                duration = int((split_end_time - split_start_time).total_seconds())
                pace = duration  # seconds per km (since split is ~1km)

                elev_change = (points[i].alt or 0.0) - (points[split_start_idx].alt or 0.0)

                splits.append(ParsedSplit(
                    split_number=split_number,
                    distance_meters=cumulative_distance - split_start_distance,
                    duration_seconds=duration,
                    pace_seconds_per_km=pace,
                    elevation_change_meters=round(elev_change, 1),
                ))

            split_number += 1
            split_start_idx = i
            split_start_distance = cumulative_distance

    return splits


def build_activity(
    points: list[TrackPoint],
    source_device: str | None = None,
) -> ParsedActivity:
    """Build a ParsedActivity from a list of TrackPoints.

    Computes total distance (haversine), duration, pace, elevation gain/loss,
    per-km splits, and assembles GeoJSON-ordered route coordinates.

    This is a module-level function so it can be reused by other services
    (e.g. StravaService) without instantiating FileParserService.
    """
    # Calculate total distance
    total_distance = 0.0
    max_speed = 0.0

    for i in range(1, len(points)):
        d = _haversine(
            points[i - 1].lat, points[i - 1].lng,
            points[i].lat, points[i].lng,
        )
        total_distance += d

        if points[i].speed and points[i].speed > max_speed:
            max_speed = points[i].speed

    # Calculate duration
    started_at = points[0].timestamp
    finished_at = points[-1].timestamp

    duration_seconds = 0
    if started_at and finished_at:
        duration_seconds = int((finished_at - started_at).total_seconds())

    # Calculate pace
    distance_km = total_distance / 1000.0
    avg_pace = None
    avg_speed = None
    if distance_km > 0 and duration_seconds > 0:
        avg_pace = int(duration_seconds / distance_km)
        avg_speed = total_distance / duration_seconds

    # Calculate elevation
    elevation_gain, elevation_loss = _calculate_elevation(points)

    # Build splits
    splits = _build_splits(points)

    # Best pace from splits
    best_pace = None
    if splits:
        best_pace = min(s.pace_seconds_per_km for s in splits)

    # Build route coordinates (GeoJSON format: [lng, lat, alt])
    route_coordinates = [
        [pt.lng, pt.lat, pt.alt]
        for pt in points
    ]

    # Elevation profile (exclude zero-altitude points that indicate missing data)
    elevation_profile = [pt.alt for pt in points if pt.alt != 0.0]

    return ParsedActivity(
        points=points,
        distance_meters=int(total_distance),
        duration_seconds=duration_seconds,
        total_elapsed_seconds=duration_seconds,
        avg_pace_seconds_per_km=avg_pace,
        best_pace_seconds_per_km=best_pace,
        avg_speed_ms=round(avg_speed, 2) if avg_speed else None,
        max_speed_ms=round(max_speed, 2) if max_speed > 0 else None,
        elevation_gain_meters=elevation_gain,
        elevation_loss_meters=elevation_loss,
        splits=splits,
        elevation_profile=elevation_profile,
        route_coordinates=route_coordinates,
        started_at=started_at,
        finished_at=finished_at,
        source_device=source_device,
    )


class FileParserService:
    """Parses GPX and FIT files into normalized ParsedActivity.

    Stateless service -- instantiate once and reuse across requests.
    All public methods accept raw file bytes and return a ParsedActivity
    with computed distance, pace, splits, and elevation data.
    """

    def parse_gpx(self, file_content: bytes) -> ParsedActivity:
        """Parse a GPX file into a ParsedActivity.

        GPX files contain track segments with lat, lon, elevation, and time.
        """
        gpx = gpxpy.parse(file_content.decode("utf-8"))

        points: list[TrackPoint] = []

        for track in gpx.tracks:
            for segment in track.segments:
                for pt in segment.points:
                    points.append(TrackPoint(
                        lat=pt.latitude,
                        lng=pt.longitude,
                        alt=pt.elevation or 0.0,
                        timestamp=pt.time,
                        speed=pt.speed,
                    ))

        if not points:
            return ParsedActivity()

        return build_activity(points, source_device=gpx.creator or None)

    def parse_fit(self, file_content: bytes) -> ParsedActivity:
        """Parse a Garmin FIT binary file into a ParsedActivity.

        FIT files contain record messages with position, altitude, speed, heart_rate.
        Coordinates in FIT are stored as semicircles (multiply by 180 / 2^31).
        """
        import io
        fit = FitFile(io.BytesIO(file_content))

        points: list[TrackPoint] = []
        source_device: str | None = None

        # Extract device info from file_id message
        for msg in fit.get_messages("file_id"):
            for field_data in msg.fields:
                if field_data.name == "manufacturer":
                    source_device = str(field_data.value)
                    break

        # Try to get device name from device_info (more specific than manufacturer)
        for msg in fit.get_messages("device_info"):
            for field_data in msg.fields:
                if field_data.name == "product_name" and field_data.value:
                    source_device = str(field_data.value)
                    break

        # Extract GPS records
        SEMICIRCLE_TO_DEGREES = 180.0 / (2 ** 31)

        for msg in fit.get_messages("record"):
            fields = {f.name: f.value for f in msg.fields}

            lat_semi = fields.get("position_lat")
            lng_semi = fields.get("position_long")

            if lat_semi is None or lng_semi is None:
                continue

            lat = lat_semi * SEMICIRCLE_TO_DEGREES
            lng = lng_semi * SEMICIRCLE_TO_DEGREES

            # Skip obviously invalid coordinates
            if abs(lat) > 90 or abs(lng) > 180:
                continue

            points.append(TrackPoint(
                lat=lat,
                lng=lng,
                alt=fields.get("enhanced_altitude") or fields.get("altitude") or 0.0,
                timestamp=fields.get("timestamp"),
                speed=fields.get("enhanced_speed") or fields.get("speed"),
                heart_rate=fields.get("heart_rate"),
            ))

        if not points:
            return ParsedActivity()

        return build_activity(points, source_device=source_device)

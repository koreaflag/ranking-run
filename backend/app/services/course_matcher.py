"""Course matcher: route matching and deviation detection.

Compares a runner's actual GPS trace against a course's reference geometry
to determine completion status and route match percentage.
"""

import math
from dataclasses import dataclass
from typing import Sequence


@dataclass
class RouteMatchResult:
    """Result of route matching analysis."""
    is_completed: bool
    route_match_percent: float
    max_deviation_meters: float
    deviation_points: int
    total_points: int
    curve_section_count: int


@dataclass
class Point2D:
    """Simple 2D point for geometric calculations."""
    lat: float
    lng: float


# Earth radius in meters
EARTH_RADIUS = 6371000.0

# Default thresholds (meters)
STRAIGHT_THRESHOLD = 50.0
CURVE_THRESHOLD = 60.0
WARNING_THRESHOLD = 30.0
COMPLETION_MIN_MATCH = 0.8
CURVATURE_THRESHOLD = 0.001  # radians/meter


def haversine_distance(p1: Point2D, p2: Point2D) -> float:
    """Calculate the great-circle distance between two points in meters.

    Args:
        p1: First point.
        p2: Second point.

    Returns:
        Distance in meters.
    """
    lat1 = math.radians(p1.lat)
    lat2 = math.radians(p2.lat)
    dlat = math.radians(p2.lat - p1.lat)
    dlng = math.radians(p2.lng - p1.lng)

    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return EARTH_RADIUS * c


def point_to_segment_distance(p: Point2D, a: Point2D, b: Point2D) -> float:
    """Calculate the shortest distance from a point to a line segment.

    Uses projection onto the segment, clamped to the segment endpoints.

    Args:
        p: The point.
        a: Segment start.
        b: Segment end.

    Returns:
        Distance in meters.
    """
    ab_dist = haversine_distance(a, b)
    if ab_dist < 1e-10:
        return haversine_distance(p, a)

    # Project point onto segment using approximate planar math
    # (accurate enough for short segments at the GPS scale)
    ap_lat = p.lat - a.lat
    ap_lng = p.lng - a.lng
    ab_lat = b.lat - a.lat
    ab_lng = b.lng - a.lng

    dot = ap_lat * ab_lat + ap_lng * ab_lng
    len_sq = ab_lat ** 2 + ab_lng ** 2

    t = max(0.0, min(1.0, dot / len_sq)) if len_sq > 0 else 0.0

    proj = Point2D(
        lat=a.lat + t * ab_lat,
        lng=a.lng + t * ab_lng,
    )

    return haversine_distance(p, proj)


def point_to_linestring_distance(p: Point2D, line: Sequence[Point2D]) -> float:
    """Calculate the shortest distance from a point to a polyline.

    Args:
        p: The point.
        line: Sequence of points forming the polyline.

    Returns:
        Minimum distance in meters.
    """
    if len(line) < 2:
        return haversine_distance(p, line[0]) if line else float("inf")

    min_dist = float("inf")
    for i in range(len(line) - 1):
        dist = point_to_segment_distance(p, line[i], line[i + 1])
        min_dist = min(min_dist, dist)

    return min_dist


def calculate_curvature(p1: Point2D, p2: Point2D, p3: Point2D) -> float:
    """Calculate the curvature at p2 given three consecutive points.

    Uses the Menger curvature formula: curvature = 2 * area / (a * b * c)
    where a, b, c are the side lengths of the triangle.

    Args:
        p1, p2, p3: Three consecutive course points.

    Returns:
        Curvature value (higher = more curved).
    """
    a = haversine_distance(p1, p2)
    b = haversine_distance(p2, p3)
    c = haversine_distance(p1, p3)

    if a < 1e-6 or b < 1e-6 or c < 1e-6:
        return 0.0

    # Semi-perimeter
    s = (a + b + c) / 2.0

    # Area by Heron's formula
    area_sq = s * (s - a) * (s - b) * (s - c)
    if area_sq < 0:
        area_sq = 0.0
    area = math.sqrt(area_sq)

    if a * b * c < 1e-10:
        return 0.0

    return 2.0 * area / (a * b * c)


def classify_segments(
    course_points: Sequence[Point2D],
    curvature_threshold: float = CURVATURE_THRESHOLD,
) -> list[bool]:
    """Classify each segment of the course as curved or straight.

    Args:
        course_points: The course geometry points.
        curvature_threshold: Curvature value above which a segment is 'curved'.

    Returns:
        List of booleans (True = curved) for each segment.
    """
    n = len(course_points)
    if n < 3:
        return [False] * max(0, n - 1)

    is_curved = [False] * (n - 1)

    for i in range(1, n - 1):
        curvature = calculate_curvature(
            course_points[i - 1],
            course_points[i],
            course_points[i + 1],
        )
        if curvature > curvature_threshold:
            # Mark both adjacent segments as curved
            is_curved[i - 1] = True
            if i < n - 1:
                is_curved[i] = True

    return is_curved


def find_nearest_segment(
    point: Point2D,
    course_points: Sequence[Point2D],
) -> int:
    """Find the index of the nearest segment to a point.

    Args:
        point: The runner's GPS point.
        course_points: The course geometry points.

    Returns:
        Index of the nearest segment (0-based).
    """
    min_dist = float("inf")
    min_idx = 0

    for i in range(len(course_points) - 1):
        dist = point_to_segment_distance(point, course_points[i], course_points[i + 1])
        if dist < min_dist:
            min_dist = dist
            min_idx = i

    return min_idx


def calculate_route_match(
    runner_points: Sequence[Point2D],
    course_points: Sequence[Point2D],
    straight_threshold: float = STRAIGHT_THRESHOLD,
    curve_threshold: float = CURVE_THRESHOLD,
) -> RouteMatchResult:
    """Calculate route match between runner's trace and course geometry.

    Algorithm:
    1. Classify each course segment as straight or curved (by curvature).
    2. For each runner GPS point, find the nearest course segment.
    3. Apply the appropriate threshold (straight or curved).
    4. Count matching points vs total points.
    5. Completion requires >= 80% match.

    Args:
        runner_points: Runner's GPS trace.
        course_points: Course reference geometry.
        straight_threshold: Max deviation for straight segments (meters).
        curve_threshold: Max deviation for curved segments (meters).

    Returns:
        RouteMatchResult with completion status and statistics.
    """
    if not runner_points or len(course_points) < 2:
        return RouteMatchResult(
            is_completed=False,
            route_match_percent=0.0,
            max_deviation_meters=0.0,
            deviation_points=0,
            total_points=len(runner_points),
            curve_section_count=0,
        )

    # Classify segments
    is_curved = classify_segments(course_points)
    curve_section_count = sum(is_curved)

    matched_count = 0
    deviation_count = 0
    max_deviation = 0.0

    for runner_point in runner_points:
        # Find nearest segment
        seg_idx = find_nearest_segment(runner_point, course_points)
        dist = point_to_segment_distance(
            runner_point,
            course_points[seg_idx],
            course_points[seg_idx + 1],
        )

        # Apply threshold based on segment type
        threshold = curve_threshold if is_curved[seg_idx] else straight_threshold

        if dist <= threshold:
            matched_count += 1
        else:
            deviation_count += 1

        max_deviation = max(max_deviation, dist)

    total = len(runner_points)
    match_ratio = matched_count / total if total > 0 else 0.0

    return RouteMatchResult(
        is_completed=match_ratio >= COMPLETION_MIN_MATCH,
        route_match_percent=round(match_ratio * 100, 1),
        max_deviation_meters=round(max_deviation, 1),
        deviation_points=deviation_count,
        total_points=total,
        curve_section_count=curve_section_count,
    )

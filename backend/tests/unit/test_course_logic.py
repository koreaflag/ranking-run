"""Unit tests for course business logic (no DB required)."""

import pytest

from app.services.course_service import CourseService, generate_thumbnail_url


# ── Difficulty algorithm ────────────────────────────────────────────


class TestComputeDifficulty:
    """Test the scoring algorithm: distance (30%), elevation (30%),
    gradient (20%), completion_rate (20%).

    easy < 33, medium 33-66, hard >= 66.
    """

    def test_short_flat_is_easy(self):
        result = CourseService._compute_difficulty(
            distance_meters=1000, elevation_gain_meters=0
        )
        assert result == "easy"

    def test_moderate_is_medium(self):
        result = CourseService._compute_difficulty(
            distance_meters=5000, elevation_gain_meters=100
        )
        assert result == "medium"

    def test_long_steep_is_hard(self):
        result = CourseService._compute_difficulty(
            distance_meters=15000, elevation_gain_meters=500
        )
        assert result == "hard"

    def test_zero_distance_is_easy(self):
        result = CourseService._compute_difficulty(
            distance_meters=0, elevation_gain_meters=0
        )
        assert result == "easy"

    def test_low_completion_rate_increases_difficulty(self):
        easy = CourseService._compute_difficulty(
            distance_meters=3000, elevation_gain_meters=50, completion_rate=1.0
        )
        hard = CourseService._compute_difficulty(
            distance_meters=3000, elevation_gain_meters=50, completion_rate=0.0
        )
        order = {"easy": 0, "medium": 1, "hard": 2}
        assert order[hard] >= order[easy]

    def test_distance_score_capped_at_10km(self):
        """Courses beyond 10 km should score the same for the distance factor."""
        r10 = CourseService._compute_difficulty(
            distance_meters=10000, elevation_gain_meters=0
        )
        r20 = CourseService._compute_difficulty(
            distance_meters=20000, elevation_gain_meters=0
        )
        assert r10 == r20

    def test_elevation_score_capped_at_300m(self):
        r300 = CourseService._compute_difficulty(
            distance_meters=3000, elevation_gain_meters=300
        )
        r600 = CourseService._compute_difficulty(
            distance_meters=3000, elevation_gain_meters=600
        )
        assert r300 == r600

    @pytest.mark.parametrize(
        "distance,elevation,expected",
        [
            (500, 0, "easy"),
            (2000, 10, "easy"),
            (10000, 200, "hard"),
        ],
    )
    def test_parametrized_cases(self, distance, elevation, expected):
        result = CourseService._compute_difficulty(
            distance_meters=distance, elevation_gain_meters=elevation
        )
        assert result == expected


# ── Thumbnail URL generation ────────────────────────────────────────


class TestGenerateThumbnailUrl:
    def test_generates_valid_url(self):
        geometry = {
            "coordinates": [[127.0, 37.5], [127.01, 37.51], [127.02, 37.52]]
        }
        url = generate_thumbnail_url(geometry, "pk.test-token")
        assert url is not None
        assert "api.mapbox.com" in url
        assert "pk.test-token" in url

    def test_returns_none_without_token(self):
        geometry = {"coordinates": [[127.0, 37.5], [127.01, 37.51]]}
        assert generate_thumbnail_url(geometry, "") is None

    def test_returns_none_without_geometry(self):
        assert generate_thumbnail_url(None, "pk.test") is None
        assert generate_thumbnail_url({}, "pk.test") is None

    def test_returns_none_for_single_point(self):
        geometry = {"coordinates": [[127.0, 37.5]]}
        assert generate_thumbnail_url(geometry, "pk.test") is None

    def test_simplifies_long_routes(self):
        coords = [[127.0 + i * 0.001, 37.5 + i * 0.001] for i in range(200)]
        geometry = {"coordinates": coords}
        url = generate_thumbnail_url(geometry, "pk.test")
        assert url is not None
        # The path segment contains semicolons between coordinate pairs
        path_segment = url.split("/static/")[1].split("/auto/")[0]
        semicolons = path_segment.count("%3B") + path_segment.count(";")
        assert semicolons <= 55

    def test_url_contains_mapbox_styles(self):
        geometry = {"coordinates": [[0.0, 0.0], [1.0, 1.0]]}
        url = generate_thumbnail_url(geometry, "pk.test")
        assert "outdoors-v12" in url
        assert "400x200@2x" in url

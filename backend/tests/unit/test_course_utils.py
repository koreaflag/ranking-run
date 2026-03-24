"""Unit tests for course utility functions (no DB required)."""

import pytest

from app.services.course_service import (
    _haversine,
    _interpolate_along_line,
    _generate_checkpoints,
    generate_thumbnail_url,
    get_route_preview,
)


# ── Haversine distance ────────────────────────────────────────────


class TestHaversine:
    """Test _haversine: distance in meters between two [lng, lat] coordinates."""

    def test_known_distance_seoul_to_busan(self):
        """Seoul (126.978, 37.566) to Busan (129.076, 35.180) ~ 325 km."""
        seoul = [126.978, 37.566]
        busan = [129.076, 35.180]
        dist = _haversine(seoul, busan)
        assert 320_000 < dist < 330_000

    def test_same_point_returns_zero(self):
        point = [127.0, 37.5]
        assert _haversine(point, point) == pytest.approx(0.0)

    def test_short_distance(self):
        """Two points ~111m apart (0.001 degree latitude at equator)."""
        p1 = [0.0, 0.0]
        p2 = [0.0, 0.001]
        dist = _haversine(p1, p2)
        assert 100 < dist < 120

    @pytest.mark.parametrize(
        "a,b",
        [
            ([0.0, 0.0], [0.0, 1.0]),
            ([0.0, 0.0], [1.0, 0.0]),
        ],
    )
    def test_symmetry(self, a, b):
        assert _haversine(a, b) == pytest.approx(_haversine(b, a))


# ── Interpolation along line ─────────────────────────────────────


class TestInterpolateAlongLine:
    """Test _interpolate_along_line: returns [lng, lat] at target_distance meters."""

    def _straight_line_coords(self) -> list[list[float]]:
        """North-south line: 0.01 degrees latitude ~ 1.11 km."""
        return [[127.0, 37.50], [127.0, 37.51]]

    def test_at_start(self):
        coords = self._straight_line_coords()
        result = _interpolate_along_line(coords, 0.0)
        assert result[0] == pytest.approx(127.0, abs=1e-4)
        assert result[1] == pytest.approx(37.50, abs=1e-4)

    def test_at_end(self):
        coords = self._straight_line_coords()
        total = _haversine(coords[0], coords[1])
        result = _interpolate_along_line(coords, total + 100)  # beyond end
        assert result[0] == pytest.approx(127.0, abs=1e-4)
        assert result[1] == pytest.approx(37.51, abs=1e-4)

    def test_at_middle(self):
        coords = self._straight_line_coords()
        total = _haversine(coords[0], coords[1])
        result = _interpolate_along_line(coords, total / 2)
        assert result[0] == pytest.approx(127.0, abs=1e-4)
        assert result[1] == pytest.approx(37.505, abs=1e-3)

    def test_multi_segment(self):
        """Three-point route: interpolation works across segments."""
        coords = [[127.0, 37.50], [127.0, 37.51], [127.0, 37.52]]
        seg1 = _haversine(coords[0], coords[1])
        # Target in second segment
        target = seg1 + 100
        result = _interpolate_along_line(coords, target)
        # Should be past the second point
        assert result[1] > 37.51


# ── Generate checkpoints ─────────────────────────────────────────


class TestGenerateCheckpoints:
    """Test _generate_checkpoints: generates checkpoints along a route."""

    def _make_route(self, km: float) -> list[list[float]]:
        """Create a simple north-south route of approximately `km` kilometers.
        ~0.009 degrees latitude per km at 37.5N.
        """
        steps = max(2, int(km * 2))
        delta = (km * 0.009) / (steps - 1)
        return [[127.0, 37.5 + i * delta] for i in range(steps)]

    def test_route_less_than_1km_returns_empty(self):
        short_route = self._make_route(0.5)
        assert _generate_checkpoints(short_route) == []

    def test_route_1km_plus_generates_checkpoints(self):
        route = self._make_route(2.0)
        cps = _generate_checkpoints(route, interval_meters=500)
        assert len(cps) >= 2  # at least start + finish

    def test_includes_start_and_finish(self):
        route = self._make_route(3.0)
        cps = _generate_checkpoints(route, interval_meters=500)
        assert cps[0]["order"] == 0
        assert cps[0]["distance_from_start_meters"] == 0
        # Finish is the last one
        assert cps[-1]["order"] == len(cps) - 1
        assert cps[-1]["distance_from_start_meters"] > 0

    def test_start_checkpoint_matches_first_coord(self):
        route = self._make_route(2.0)
        cps = _generate_checkpoints(route, interval_meters=500)
        assert cps[0]["lng"] == pytest.approx(route[0][0])
        assert cps[0]["lat"] == pytest.approx(route[0][1])

    def test_finish_checkpoint_matches_last_coord(self):
        route = self._make_route(2.0)
        cps = _generate_checkpoints(route, interval_meters=500)
        assert cps[-1]["lng"] == pytest.approx(route[-1][0])
        assert cps[-1]["lat"] == pytest.approx(route[-1][1])

    def test_single_point_returns_empty(self):
        assert _generate_checkpoints([[127.0, 37.5]]) == []

    def test_checkpoint_ids_are_sequential(self):
        route = self._make_route(5.0)
        cps = _generate_checkpoints(route, interval_meters=500)
        ids = [cp["id"] for cp in cps]
        assert ids == list(range(1, len(cps) + 1))

    def test_last_intermediate_at_least_200m_from_finish(self):
        route = self._make_route(3.0)
        cps = _generate_checkpoints(route, interval_meters=500)
        if len(cps) >= 3:
            last_intermediate = cps[-2]
            finish = cps[-1]
            gap = finish["distance_from_start_meters"] - last_intermediate["distance_from_start_meters"]
            assert gap >= 200


# ── Route preview ─────────────────────────────────────────────────


class TestGetRoutePreview:
    """Test get_route_preview: converts a Course's route_geometry to [[lng, lat], ...]."""

    def test_none_geometry_returns_none(self):
        """A course with route_geometry=None should return None."""
        from unittest.mock import MagicMock

        course = MagicMock()
        course.route_geometry = None
        assert get_route_preview(course) is None


# ── Thumbnail URL generation ─────────────────────────────────────


class TestGenerateThumbnailUrl:
    """Test generate_thumbnail_url: Mapbox Static Images URL from route geometry."""

    def test_no_token_returns_none(self):
        geometry = {"coordinates": [[127.0, 37.5], [127.01, 37.51]]}
        assert generate_thumbnail_url(geometry, "") is None

    def test_valid_input_returns_url_string(self):
        geometry = {
            "coordinates": [[127.0, 37.5], [127.01, 37.51], [127.02, 37.52]]
        }
        url = generate_thumbnail_url(geometry, "pk.test-token")
        assert isinstance(url, str)
        assert "api.mapbox.com" in url
        assert "pk.test-token" in url

    def test_less_than_2_coords_returns_none(self):
        assert generate_thumbnail_url({"coordinates": [[127.0, 37.5]]}, "pk.test") is None

    def test_none_geometry_returns_none(self):
        assert generate_thumbnail_url(None, "pk.test") is None

    def test_empty_geometry_returns_none(self):
        assert generate_thumbnail_url({}, "pk.test") is None

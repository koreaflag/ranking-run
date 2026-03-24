"""Unit tests for run service business logic (no DB required)."""

import logging

import pytest

from app.services.run_service import RunService, _validate_checkpoints


# ── Checkpoint validation ─────────────────────────────────────────


class TestValidateCheckpoints:
    """Test _validate_checkpoints: matches client-reported passes against
    course checkpoints, requiring distance <= 50m to count as passed."""

    def _make_course_cps(self, ids: list[int]) -> list[dict]:
        return [{"id": i} for i in ids]

    def _make_passes(self, entries: list[tuple[int, float, str]]) -> list[dict]:
        """entries: [(checkpoint_id, distance_from_checkpoint, timestamp), ...]"""
        return [
            {
                "checkpoint_id": cid,
                "distance_from_checkpoint": dist,
                "timestamp": ts,
            }
            for cid, dist, ts in entries
        ]

    def test_all_passed(self):
        course_cps = self._make_course_cps([1, 2, 3])
        passes = self._make_passes([
            (1, 10.0, "2024-01-01T00:01:00Z"),
            (2, 25.0, "2024-01-01T00:02:00Z"),
            (3, 50.0, "2024-01-01T00:03:00Z"),
        ])
        results = _validate_checkpoints(course_cps, passes)
        assert len(results) == 3
        assert all(r["passed"] for r in results)

    def test_partial_pass(self):
        course_cps = self._make_course_cps([1, 2, 3])
        passes = self._make_passes([
            (1, 5.0, "2024-01-01T00:01:00Z"),
            (3, 40.0, "2024-01-01T00:03:00Z"),
        ])
        results = _validate_checkpoints(course_cps, passes)
        assert results[0]["passed"] is True
        assert results[1]["passed"] is False  # checkpoint 2 missing from passes
        assert results[2]["passed"] is True

    def test_none_passed_no_matching_ids(self):
        course_cps = self._make_course_cps([1, 2])
        passes = self._make_passes([
            (99, 10.0, "2024-01-01T00:01:00Z"),
        ])
        results = _validate_checkpoints(course_cps, passes)
        assert all(r["passed"] is False for r in results)

    def test_distance_over_50m_fails(self):
        course_cps = self._make_course_cps([1])
        passes = self._make_passes([
            (1, 50.1, "2024-01-01T00:01:00Z"),
        ])
        results = _validate_checkpoints(course_cps, passes)
        assert results[0]["passed"] is False

    def test_distance_exactly_50m_passes(self):
        course_cps = self._make_course_cps([1])
        passes = self._make_passes([
            (1, 50.0, "2024-01-01T00:01:00Z"),
        ])
        results = _validate_checkpoints(course_cps, passes)
        assert results[0]["passed"] is True

    def test_empty_checkpoints(self):
        results = _validate_checkpoints([], [])
        assert results == []

    def test_empty_passes_all_fail(self):
        course_cps = self._make_course_cps([1, 2])
        results = _validate_checkpoints(course_cps, [])
        assert len(results) == 2
        assert all(r["passed"] is False for r in results)
        assert all(r["timestamp"] is None for r in results)
        assert all(r["distance_meters"] is None for r in results)

    def test_result_contains_timestamp_and_distance(self):
        course_cps = self._make_course_cps([1])
        passes = self._make_passes([
            (1, 12.5, "2024-01-01T00:05:00Z"),
        ])
        results = _validate_checkpoints(course_cps, passes)
        assert results[0]["timestamp"] == "2024-01-01T00:05:00Z"
        assert results[0]["distance_meters"] == 12.5


# ── GPS temporal order validation ─────────────────────────────────


class TestValidateGpsTemporalOrder:
    """Test RunService._validate_gps_temporal_order: logs a warning
    when GPS point timestamps are not monotonically increasing."""

    def test_in_order_no_warning(self, caplog):
        points = [
            {"timestamp": 1000},
            {"timestamp": 2000},
            {"timestamp": 3000},
        ]
        with caplog.at_level(logging.WARNING):
            RunService._validate_gps_temporal_order(points)
        assert "out-of-order" not in caplog.text

    def test_out_of_order_warning_logged(self, caplog):
        points = [
            {"timestamp": 3000},
            {"timestamp": 1000},
            {"timestamp": 2000},
        ]
        with caplog.at_level(logging.WARNING):
            RunService._validate_gps_temporal_order(points)
        assert "out-of-order" in caplog.text

    def test_single_point_no_warning(self, caplog):
        with caplog.at_level(logging.WARNING):
            RunService._validate_gps_temporal_order([{"timestamp": 1000}])
        assert "out-of-order" not in caplog.text

    def test_empty_list_no_warning(self, caplog):
        with caplog.at_level(logging.WARNING):
            RunService._validate_gps_temporal_order([])
        assert "out-of-order" not in caplog.text

    def test_equal_timestamps_no_warning(self, caplog):
        points = [
            {"timestamp": 1000},
            {"timestamp": 1000},
        ]
        with caplog.at_level(logging.WARNING):
            RunService._validate_gps_temporal_order(points)
        assert "out-of-order" not in caplog.text

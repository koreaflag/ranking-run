"""Unit tests for stats service business logic (no DB required)."""

from datetime import datetime, timedelta, timezone

import pytest

from app.services.stats_service import StatsService


# ── Date filter ───────────────────────────────────────────────────


class TestGetDateFilter:
    """Test StatsService._get_date_filter: converts period string to start datetime."""

    def setup_method(self):
        self.service = StatsService()
        self.now = datetime(2026, 3, 24, 12, 0, 0, tzinfo=timezone.utc)

    @pytest.mark.parametrize(
        "period,expected_days",
        [
            ("week", 7),
            ("month", 30),
            ("year", 365),
        ],
    )
    def test_known_periods(self, period, expected_days):
        result = self.service._get_date_filter(period, self.now)
        expected = self.now - timedelta(days=expected_days)
        assert result == expected

    def test_all_returns_none(self):
        result = self.service._get_date_filter("all", self.now)
        assert result is None

    def test_unknown_period_returns_none(self):
        result = self.service._get_date_filter("unknown_value", self.now)
        assert result is None

    def test_week_is_7_days_ago(self):
        result = self.service._get_date_filter("week", self.now)
        diff = self.now - result
        assert diff.days == 7

    def test_month_is_30_days_ago(self):
        result = self.service._get_date_filter("month", self.now)
        diff = self.now - result
        assert diff.days == 30

    def test_year_is_365_days_ago(self):
        result = self.service._get_date_filter("year", self.now)
        diff = self.now - result
        assert diff.days == 365

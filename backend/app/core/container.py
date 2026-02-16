"""Dependency-Injector container: Factory-based service wiring."""

from dependency_injector import containers, providers

from app.core.config import get_settings
from app.services.auth_service import AuthService
from app.services.course_service import CourseService
from app.services.ranking_service import RankingService
from app.services.run_service import RunService
from app.services.stats_service import StatsService


class Container(containers.DeclarativeContainer):
    """Application DI container.

    Services are wired as Factory providers so each injection point
    receives a fresh instance. Stateless services (Course, Run, Ranking,
    Stats) take no constructor args; AuthService receives Settings.
    """

    wiring_config = containers.WiringConfiguration(
        modules=[
            "app.api.v1.auth",
            "app.api.v1.courses",
            "app.api.v1.runs",
            "app.api.v1.rankings",
            "app.api.v1.users",
        ],
    )

    # Configuration
    settings = providers.Singleton(get_settings)

    # Services
    auth_service = providers.Factory(AuthService, settings=settings)
    course_service = providers.Factory(CourseService)
    run_service = providers.Factory(RunService)
    ranking_service = providers.Factory(RankingService)
    stats_service = providers.Factory(StatsService)

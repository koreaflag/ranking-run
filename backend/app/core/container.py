"""Dependency-Injector container: Factory-based service wiring."""

from dependency_injector import containers, providers

from app.core.config import get_settings
from app.services.auth_service import AuthService
from app.services.community_service import CommunityService
from app.services.contact_service import ContactService
from app.services.course_service import CourseService
from app.services.crew_chat_service import CrewChatService
from app.services.crew_service import CrewService
from app.services.event_service import EventService
from app.services.follow_service import FollowService
from app.services.friend_request_service import FriendRequestService
from app.services.gear_service import GearService
from app.services.import_service import ImportService
from app.services.like_service import LikeService
from app.services.ranking_service import RankingService
from app.services.review_service import ReviewService
from app.services.run_service import RunService
from app.services.stats_service import StatsService
from app.services.notification_service import NotificationService
from app.services.map_matching_service import MapMatchingService
from app.services.announcement_service import AnnouncementService
from app.services.crew_join_request_service import CrewJoinRequestService
from app.services.group_ranking_service import GroupRankingService
from app.services.group_run_service import GroupRunService
from app.services.crew_challenge_service import CrewChallengeService
from app.services.crew_ranking_service import CrewRankingService
from app.services.strava_service import StravaService


class Container(containers.DeclarativeContainer):
    """Application DI container.

    Services are wired as Factory providers so each injection point
    receives a fresh instance. Stateless services (Course, Run, Ranking,
    Stats) take no constructor args; AuthService receives Settings.
    """

    wiring_config = containers.WiringConfiguration(
        modules=[
            "app.api.v1.auth",
            "app.api.v1.community",
            "app.api.v1.contacts",
            "app.api.v1.courses",
            "app.api.v1.crew_chat",
            "app.api.v1.crews",
            "app.api.v1.events",
            "app.api.v1.follows",
            "app.api.v1.friends",
            "app.api.v1.gear",
            "app.api.v1.runs",
            "app.api.v1.rankings",
            "app.api.v1.likes",
            "app.api.v1.reviews",
            "app.api.v1.imports",
            "app.api.v1.notifications",
            "app.api.v1.announcements",
            "app.api.v1.crew_join_requests",
            "app.api.v1.group_runs",
            "app.api.v1.crew_challenges",
            "app.api.v1.strava",
            "app.api.v1.leaderboard",
            "app.api.v1.users",
        ],
    )

    # Configuration
    settings = providers.Singleton(get_settings)

    # Services
    announcement_service = providers.Factory(AnnouncementService)
    auth_service = providers.Factory(AuthService, settings=settings)
    community_service = providers.Factory(CommunityService)
    contact_service = providers.Factory(ContactService)
    course_service = providers.Factory(CourseService)
    crew_chat_service = providers.Factory(CrewChatService)
    crew_join_request_service = providers.Factory(CrewJoinRequestService)
    crew_service = providers.Factory(CrewService)
    event_service = providers.Factory(EventService)
    follow_service = providers.Factory(FollowService)
    friend_request_service = providers.Factory(FriendRequestService)
    gear_service = providers.Factory(GearService)
    crew_challenge_service = providers.Factory(CrewChallengeService)
    crew_ranking_service = providers.Factory(CrewRankingService)
    group_ranking_service = providers.Factory(GroupRankingService)
    group_run_service = providers.Factory(GroupRunService)
    import_service = providers.Factory(ImportService)
    like_service = providers.Factory(LikeService)
    map_matching_service = providers.Singleton(MapMatchingService)
    run_service = providers.Factory(RunService)
    ranking_service = providers.Factory(RankingService)
    review_service = providers.Factory(ReviewService)
    stats_service = providers.Factory(StatsService)
    notification_service = providers.Factory(NotificationService, settings=settings)
    strava_service = providers.Factory(StravaService, settings=settings)

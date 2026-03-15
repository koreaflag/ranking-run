"""Crew challenge (raid run) service: create, end, and query crew challenges."""

import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.crew_level_config import get_max_active_challenges
from app.core.exceptions import BadRequestError, NotFoundError, PermissionDeniedError
from app.models.course import Course
from app.models.crew import Crew, CrewMember
from app.models.crew_challenge import CrewChallenge, CrewChallengeRecord

logger = logging.getLogger(__name__)


class CrewChallengeService:
    """Handles crew challenge lifecycle: creation, termination, and queries."""

    MAX_CHALLENGE_DURATION_DAYS = 90

    async def create_challenge(
        self,
        db: AsyncSession,
        crew_id: UUID,
        course_id: UUID,
        user_id: UUID,
        end_date: datetime | None = None,
    ) -> dict:
        """Create a new crew challenge (raid run) for the given crew and course.

        Only crew owners and admins may create challenges. The number of
        concurrent active challenges is limited by the crew's level.
        """
        # Verify crew exists
        crew = await db.get(Crew, crew_id)
        if crew is None:
            raise NotFoundError(code="CREW_NOT_FOUND", message="크루를 찾을 수 없습니다")

        # Verify user is owner or admin
        await self._require_crew_admin(db, crew_id, user_id)

        # Verify course exists
        course = await db.get(Course, course_id)
        if course is None:
            raise NotFoundError(code="COURSE_NOT_FOUND", message="코스를 찾을 수 없습니다")

        # Check active challenge limit based on crew level
        max_challenges = get_max_active_challenges(crew.level)
        active_count_result = await db.execute(
            select(func.count()).select_from(CrewChallenge).where(
                CrewChallenge.crew_id == crew_id,
                CrewChallenge.status == "active",
            )
        )
        active_count = active_count_result.scalar() or 0
        if active_count >= max_challenges:
            raise BadRequestError(
                code="CHALLENGE_LIMIT",
                message=f"동시 챌린지는 최대 {max_challenges}개입니다",
            )

        # Validate end_date if provided
        now = datetime.now(timezone.utc)
        if end_date is not None:
            if end_date <= now:
                raise BadRequestError(
                    code="INVALID_END_DATE",
                    message="챌린지 종료일은 현재 시간 이후여야 합니다",
                )
            if end_date - now > timedelta(days=self.MAX_CHALLENGE_DURATION_DAYS):
                raise BadRequestError(
                    code="DURATION_TOO_LONG",
                    message=f"챌린지 기간은 최대 {self.MAX_CHALLENGE_DURATION_DAYS}일입니다",
                )

        # Auto-end stale active challenges older than MAX_CHALLENGE_DURATION_DAYS
        stale_cutoff = now - timedelta(days=self.MAX_CHALLENGE_DURATION_DAYS)
        stale_result = await db.execute(
            select(CrewChallenge).where(
                CrewChallenge.crew_id == crew_id,
                CrewChallenge.status == "active",
                CrewChallenge.created_at < stale_cutoff,
            )
        )
        for stale in stale_result.scalars().all():
            stale.status = "ended"
            stale.ended_at = now
            logger.info("Auto-ended stale challenge %s (created %s)", stale.id, stale.created_at)

        # Create new challenge
        challenge = CrewChallenge(
            crew_id=crew_id,
            course_id=course_id,
            created_by=user_id,
            status="active",
        )
        db.add(challenge)
        await db.flush()
        await db.refresh(challenge)

        logger.info(
            "Crew challenge created: crew=%s course=%s by=%s",
            crew_id,
            course_id,
            user_id,
        )

        return await self._challenge_to_dict(db, challenge, crew)

    async def end_challenge(
        self,
        db: AsyncSession,
        crew_id: UUID,
        challenge_id: UUID,
        user_id: UUID,
    ) -> dict:
        """End an active crew challenge. Only crew owners/admins may do this."""
        # Get challenge and verify it belongs to crew
        challenge = await self._get_challenge_or_404(db, challenge_id)

        if challenge.crew_id != crew_id:
            raise NotFoundError(
                code="CHALLENGE_NOT_FOUND",
                message="해당 크루의 챌린지를 찾을 수 없습니다",
            )

        if challenge.status != "active":
            raise NotFoundError(
                code="CHALLENGE_NOT_ACTIVE",
                message="이미 종료된 챌린지입니다",
            )

        # Verify user is owner or admin
        await self._require_crew_admin(db, crew_id, user_id)

        # End the challenge
        challenge.status = "ended"
        challenge.ended_at = datetime.now(timezone.utc)
        await db.flush()

        crew = await db.get(Crew, crew_id)

        logger.info(
            "Crew challenge ended: challenge=%s crew=%s by=%s",
            challenge_id,
            crew_id,
            user_id,
        )

        return await self._challenge_to_dict(db, challenge, crew)

    async def get_active_challenge(
        self,
        db: AsyncSession,
        crew_id: UUID,
    ) -> dict | None:
        """Get the currently active challenge for a crew, or None."""
        result = await db.execute(
            select(CrewChallenge).where(
                CrewChallenge.crew_id == crew_id,
                CrewChallenge.status == "active",
            )
        )
        challenge = result.scalar_one_or_none()
        if challenge is None:
            return None

        crew = await db.get(Crew, crew_id)
        return await self._challenge_to_dict(db, challenge, crew)

    async def get_challenge_history(
        self,
        db: AsyncSession,
        crew_id: UUID,
        page: int = 0,
        per_page: int = 20,
    ) -> dict:
        """Get paginated history of ended challenges for a crew."""
        # Total count
        total_result = await db.execute(
            select(func.count(CrewChallenge.id)).where(
                CrewChallenge.crew_id == crew_id,
                CrewChallenge.status == "ended",
            )
        )
        total = total_result.scalar() or 0

        # Paginated results
        result = await db.execute(
            select(CrewChallenge)
            .where(
                CrewChallenge.crew_id == crew_id,
                CrewChallenge.status == "ended",
            )
            .order_by(CrewChallenge.ended_at.desc())
            .offset(page * per_page)
            .limit(per_page)
        )
        challenges = result.scalars().all()

        crew = await db.get(Crew, crew_id)
        data = [
            await self._challenge_to_dict(db, c, crew) for c in challenges
        ]

        return {
            "data": data,
            "total_count": total,
        }

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    async def _get_challenge_or_404(
        self,
        db: AsyncSession,
        challenge_id: UUID,
    ) -> CrewChallenge:
        challenge = await db.get(CrewChallenge, challenge_id)
        if challenge is None:
            raise NotFoundError(
                code="CHALLENGE_NOT_FOUND",
                message="챌린지를 찾을 수 없습니다",
            )
        return challenge

    async def _require_crew_admin(
        self,
        db: AsyncSession,
        crew_id: UUID,
        user_id: UUID,
    ) -> CrewMember:
        """Verify user is an owner or admin of the crew. Raises on failure."""
        result = await db.execute(
            select(CrewMember).where(
                CrewMember.crew_id == crew_id,
                CrewMember.user_id == user_id,
                CrewMember.role.in_(["owner", "admin"]),
            )
        )
        member = result.scalar_one_or_none()
        if member is None:
            raise PermissionDeniedError(
                code="NOT_CREW_ADMIN",
                message="크루 관리자만 레이드를 시작할 수 있습니다",
            )
        return member

    async def _challenge_to_dict(
        self,
        db: AsyncSession,
        challenge: CrewChallenge,
        crew: Crew | None,
    ) -> dict:
        """Convert a CrewChallenge to a response dictionary."""
        # Get course info
        course = await db.get(Course, challenge.course_id)

        # Get records with user info, ordered by best time
        records_result = await db.execute(
            select(CrewChallengeRecord)
            .where(CrewChallengeRecord.challenge_id == challenge.id)
            .options(joinedload(CrewChallengeRecord.user))
            .order_by(
                CrewChallengeRecord.best_duration_seconds.asc().nulls_last()
            )
        )
        records = records_result.scalars().unique().all()
        completed_count = sum(
            1 for r in records if r.best_duration_seconds is not None
        )

        return {
            "id": str(challenge.id),
            "crew_id": str(challenge.crew_id),
            "course_id": str(challenge.course_id),
            "course_name": course.title if course else None,
            "course_distance_meters": course.distance_meters if course else None,
            "created_by": str(challenge.created_by) if challenge.created_by else None,
            "status": challenge.status,
            "records": [
                {
                    "user_id": str(r.user_id),
                    "nickname": r.user.nickname if r.user else None,
                    "avatar_url": r.user.avatar_url if r.user else None,
                    "best_duration_seconds": r.best_duration_seconds,
                    "best_pace_seconds_per_km": r.best_pace_seconds_per_km,
                    "completed_at": r.completed_at,
                    "run_count": r.run_count,
                }
                for r in records
            ],
            "completed_count": completed_count,
            "total_participants": crew.member_count if crew else 0,
            "created_at": challenge.created_at,
            "ended_at": challenge.ended_at,
        }

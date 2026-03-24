"""Challenge service: manage challenges, participation, and progress."""

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.models.challenge import Challenge, ChallengeParticipant
from app.models.user import User


class ChallengeService:
    """Handles challenge listing, joining, and progress updates."""

    async def list_active(
        self,
        db: AsyncSession,
        user_id: UUID,
    ) -> tuple[list[dict], int]:
        """Get all active challenges with user's progress.

        Returns:
            Tuple of (challenge dicts with participant_count and my_progress, total count).
        """
        now = datetime.now(timezone.utc)

        base_filters = [
            Challenge.is_active.is_(True),
            Challenge.end_at > now,
        ]

        # Count
        count_result = await db.execute(
            select(func.count(Challenge.id)).where(*base_filters)
        )
        total = count_result.scalar_one()

        # Fetch challenges
        result = await db.execute(
            select(Challenge)
            .where(*base_filters)
            .order_by(Challenge.start_at.asc())
        )
        challenges = result.scalars().all()

        challenge_ids = [c.id for c in challenges]
        counts = await self._get_participant_counts(db, challenge_ids)
        user_progress = await self._get_user_progress(db, challenge_ids, user_id)

        enriched = []
        for c in challenges:
            progress = user_progress.get(c.id)
            my_progress = None
            if progress is not None:
                pct = min(
                    round((progress["current_value"] / c.goal_value) * 100, 1)
                    if c.goal_value > 0
                    else 100.0,
                    100.0,
                )
                my_progress = {
                    "current_value": progress["current_value"],
                    "goal_value": c.goal_value,
                    "progress_percent": pct,
                    "is_completed": progress["is_completed"],
                }

            enriched.append(
                {
                    "id": str(c.id),
                    "title": c.title,
                    "description": c.description,
                    "challenge_type": c.challenge_type,
                    "goal_value": c.goal_value,
                    "reward_points": c.reward_points,
                    "start_at": c.start_at,
                    "end_at": c.end_at,
                    "is_active": c.is_active,
                    "participant_count": counts.get(c.id, 0),
                    "my_progress": my_progress,
                }
            )

        return enriched, total

    async def get_detail(
        self,
        db: AsyncSession,
        challenge_id: UUID,
        user_id: UUID,
    ) -> dict:
        """Get challenge detail with progress and leaderboard.

        Raises:
            NotFoundError: Challenge does not exist.
        """
        result = await db.execute(
            select(Challenge).where(Challenge.id == challenge_id)
        )
        challenge = result.scalar_one_or_none()

        if challenge is None:
            raise NotFoundError(
                code="NOT_FOUND", message="챌린지를 찾을 수 없습니다"
            )

        counts = await self._get_participant_counts(db, [challenge.id])
        user_progress = await self._get_user_progress(
            db, [challenge.id], user_id
        )

        progress = user_progress.get(challenge.id)
        my_progress = None
        if progress is not None:
            pct = min(
                round(
                    (progress["current_value"] / challenge.goal_value) * 100, 1
                )
                if challenge.goal_value > 0
                else 100.0,
                100.0,
            )
            my_progress = {
                "current_value": progress["current_value"],
                "goal_value": challenge.goal_value,
                "progress_percent": pct,
                "is_completed": progress["is_completed"],
            }

        # Leaderboard: top 50 by current_value desc
        lb_result = await db.execute(
            select(ChallengeParticipant)
            .where(ChallengeParticipant.challenge_id == challenge_id)
            .order_by(ChallengeParticipant.current_value.desc())
            .limit(50)
        )
        participants = lb_result.scalars().all()

        leaderboard = []
        for rank, p in enumerate(participants, start=1):
            leaderboard.append(
                {
                    "user_id": str(p.user_id),
                    "nickname": p.user.nickname if p.user else None,
                    "avatar_url": p.user.avatar_url if p.user else None,
                    "current_value": p.current_value,
                    "is_completed": p.is_completed,
                    "rank": rank,
                }
            )

        return {
            "id": str(challenge.id),
            "title": challenge.title,
            "description": challenge.description,
            "challenge_type": challenge.challenge_type,
            "goal_value": challenge.goal_value,
            "reward_points": challenge.reward_points,
            "start_at": challenge.start_at,
            "end_at": challenge.end_at,
            "is_active": challenge.is_active,
            "participant_count": counts.get(challenge.id, 0),
            "my_progress": my_progress,
            "leaderboard": leaderboard,
        }

    async def join(
        self,
        db: AsyncSession,
        challenge_id: UUID,
        user_id: UUID,
        crew_id: str | None = None,
    ) -> ChallengeParticipant:
        """Join a challenge.

        Raises:
            NotFoundError: Challenge does not exist.
            ValidationError: Challenge is not active or has ended.
            ConflictError: Already participating.
        """
        result = await db.execute(
            select(Challenge).where(Challenge.id == challenge_id)
        )
        challenge = result.scalar_one_or_none()

        if challenge is None:
            raise NotFoundError(
                code="NOT_FOUND", message="챌린지를 찾을 수 없습니다"
            )

        now = datetime.now(timezone.utc)
        if not challenge.is_active or challenge.end_at <= now:
            raise ValidationError(
                code="CHALLENGE_ENDED",
                message="종료되었거나 비활성화된 챌린지입니다",
            )

        # Check duplicate
        existing = await db.execute(
            select(ChallengeParticipant.id).where(
                ChallengeParticipant.challenge_id == challenge_id,
                ChallengeParticipant.user_id == user_id,
            )
        )
        if existing.scalar_one_or_none() is not None:
            raise ConflictError(
                code="ALREADY_JOINED", message="이미 참여중인 챌린지입니다"
            )

        participant = ChallengeParticipant(
            challenge_id=challenge_id,
            user_id=user_id,
            crew_id=UUID(crew_id) if crew_id else None,
        )
        db.add(participant)
        await db.flush()
        await db.refresh(participant)

        return participant

    async def update_progress(
        self,
        db: AsyncSession,
        user_id: UUID,
        distance_meters: int,
        run_count: int,
    ) -> None:
        """Update progress for all active challenges a user is participating in.

        Called after each run completes. Increments current_value based on
        challenge_type and marks completion when goal is reached.
        """
        now = datetime.now(timezone.utc)

        # Get all active challenge participations for this user
        result = await db.execute(
            select(ChallengeParticipant)
            .join(Challenge)
            .where(
                ChallengeParticipant.user_id == user_id,
                ChallengeParticipant.is_completed.is_(False),
                Challenge.is_active.is_(True),
                Challenge.end_at > now,
            )
        )
        participations = result.scalars().all()

        if not participations:
            return

        # Batch-load challenges
        challenge_ids = [p.challenge_id for p in participations]
        ch_result = await db.execute(
            select(Challenge).where(Challenge.id.in_(challenge_ids))
        )
        challenges_map = {c.id: c for c in ch_result.scalars().all()}

        for p in participations:
            challenge = challenges_map.get(p.challenge_id)
            if challenge is None:
                continue

            # Determine increment based on challenge type
            increment = 0
            if challenge.challenge_type in (
                "individual_distance",
                "crew_distance",
            ):
                increment = distance_meters
            elif challenge.challenge_type in (
                "individual_runs",
                "crew_runs",
            ):
                increment = run_count
            elif challenge.challenge_type == "individual_streak":
                # Streak: each run day counts as 1
                increment = 1

            if increment <= 0:
                continue

            p.current_value += increment

            # Check completion
            if p.current_value >= challenge.goal_value:
                p.is_completed = True
                p.completed_at = now

                # Award points
                if challenge.reward_points > 0:
                    user_result = await db.execute(
                        select(User).where(User.id == user_id)
                    )
                    user = user_result.scalar_one_or_none()
                    if user is not None:
                        user.total_points += challenge.reward_points

        await db.flush()

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    async def _get_participant_counts(
        self,
        db: AsyncSession,
        challenge_ids: list[UUID],
    ) -> dict[UUID, int]:
        """Get participant counts for a list of challenge IDs."""
        if not challenge_ids:
            return {}

        result = await db.execute(
            select(
                ChallengeParticipant.challenge_id,
                func.count(ChallengeParticipant.id),
            )
            .where(ChallengeParticipant.challenge_id.in_(challenge_ids))
            .group_by(ChallengeParticipant.challenge_id)
        )
        return {row[0]: row[1] for row in result.all()}

    async def _get_user_progress(
        self,
        db: AsyncSession,
        challenge_ids: list[UUID],
        user_id: UUID | None,
    ) -> dict[UUID, dict]:
        """Get the current user's progress for a list of challenge IDs."""
        if not challenge_ids or user_id is None:
            return {}

        result = await db.execute(
            select(
                ChallengeParticipant.challenge_id,
                ChallengeParticipant.current_value,
                ChallengeParticipant.is_completed,
            ).where(
                ChallengeParticipant.challenge_id.in_(challenge_ids),
                ChallengeParticipant.user_id == user_id,
            )
        )
        return {
            row[0]: {"current_value": row[1], "is_completed": row[2]}
            for row in result.all()
        }

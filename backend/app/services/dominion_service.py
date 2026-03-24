"""DominionService: recalculate, query, and notify course dominion changes."""

import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.course_dominion import CourseDominion, CourseDominionHistory
from app.models.crew import Crew, CrewMember

logger = logging.getLogger(__name__)

MIN_MEMBERS_FOR_DOMINION = 3


class DominionService:

    async def recalculate_dominion(
        self,
        db: AsyncSession,
        course_id: UUID,
        trigger_user_id: UUID | None = None,
    ) -> None:
        """Recalculate which crew dominates a course.

        Algorithm:
        1. For each crew, get members' best times from rankings table
        2. Take top 3 fastest members per crew
        3. Crew with lowest avg of top 3 wins
        4. If winner changed, record history + send notifications
        """
        # Find the best crew using a single SQL query
        result = await db.execute(text("""
            WITH crew_member_rankings AS (
                SELECT
                    cm.crew_id,
                    r.user_id,
                    r.best_duration_seconds,
                    ROW_NUMBER() OVER (
                        PARTITION BY cm.crew_id
                        ORDER BY r.best_duration_seconds ASC
                    ) AS rn
                FROM rankings r
                JOIN crew_members cm ON cm.user_id = r.user_id
                WHERE r.course_id = :course_id
            ),
            crew_top3 AS (
                SELECT
                    crew_id,
                    AVG(best_duration_seconds)::int AS avg_top3,
                    array_agg(user_id ORDER BY best_duration_seconds ASC) AS member_ids
                FROM crew_member_rankings
                WHERE rn <= 3
                GROUP BY crew_id
                HAVING COUNT(*) >= :min_members
            )
            SELECT ct.crew_id, ct.avg_top3, ct.member_ids, c.name AS crew_name
            FROM crew_top3 ct
            JOIN crews c ON c.id = ct.crew_id
            ORDER BY ct.avg_top3 ASC
            LIMIT 1
        """), {"course_id": course_id, "min_members": MIN_MEMBERS_FOR_DOMINION})

        best_crew = result.first()

        # Get current dominion
        current_result = await db.execute(
            select(CourseDominion).where(CourseDominion.course_id == course_id)
        )
        current = current_result.scalar_one_or_none()

        if best_crew is None:
            # No crew qualifies — remove existing dominion if any
            if current is not None:
                await db.execute(
                    delete(CourseDominion).where(CourseDominion.course_id == course_id)
                )
            return

        new_crew_id = best_crew.crew_id
        new_avg = best_crew.avg_top3
        new_member_ids = [str(uid) for uid in best_crew.member_ids]
        new_crew_name = best_crew.crew_name

        if current is None:
            # First dominion for this course
            dominion = CourseDominion(
                course_id=course_id,
                crew_id=new_crew_id,
                crew_name=new_crew_name,
                avg_duration_seconds=new_avg,
                top_member_ids=new_member_ids,
            )
            db.add(dominion)

            history = CourseDominionHistory(
                course_id=course_id,
                previous_crew_id=None,
                new_crew_id=new_crew_id,
                previous_avg_seconds=None,
                new_avg_seconds=new_avg,
            )
            db.add(history)

            # Notify new dominating crew
            await self._notify_dominion_gained(
                db, course_id, new_crew_id, trigger_user_id
            )

        elif current.crew_id != new_crew_id:
            # Dominion changed hands
            old_crew_id = current.crew_id
            old_avg = current.avg_duration_seconds

            current.crew_id = new_crew_id
            current.crew_name = new_crew_name
            current.avg_duration_seconds = new_avg
            current.top_member_ids = new_member_ids
            current.dominated_since = datetime.now(timezone.utc)
            current.points_accumulated = 0

            history = CourseDominionHistory(
                course_id=course_id,
                previous_crew_id=old_crew_id,
                new_crew_id=new_crew_id,
                previous_avg_seconds=old_avg,
                new_avg_seconds=new_avg,
            )
            db.add(history)

            # Notify both crews
            await self._notify_dominion_gained(
                db, course_id, new_crew_id, trigger_user_id
            )
            await self._notify_dominion_lost(
                db, course_id, old_crew_id, new_crew_name, trigger_user_id
            )

        else:
            # Same crew still dominates — update stats
            current.avg_duration_seconds = new_avg
            current.top_member_ids = new_member_ids

    async def get_course_dominion(
        self,
        db: AsyncSession,
        course_id: UUID,
    ) -> dict | None:
        """Get current dominion info for a course with crew + member details."""
        result = await db.execute(
            select(CourseDominion).where(CourseDominion.course_id == course_id)
        )
        dominion = result.scalar_one_or_none()
        if dominion is None:
            return None

        # Get crew details
        crew_result = await db.execute(
            select(Crew).where(Crew.id == dominion.crew_id)
        )
        crew = crew_result.scalar_one_or_none()
        if crew is None:
            return None

        # Get top member details
        from app.models.user import User

        member_ids = [UUID(uid) for uid in dominion.top_member_ids]
        members_result = await db.execute(
            select(User.id, User.nickname, User.avatar_url)
            .where(User.id.in_(member_ids))
        )
        members_map = {
            row.id: {"user_id": str(row.id), "nickname": row.nickname, "avatar_url": row.avatar_url}
            for row in members_result.all()
        }

        # Get each member's best time from rankings
        from app.models.ranking import Ranking

        rankings_result = await db.execute(
            select(Ranking.user_id, Ranking.best_duration_seconds)
            .where(Ranking.course_id == course_id, Ranking.user_id.in_(member_ids))
        )
        for row in rankings_result.all():
            if row.user_id in members_map:
                members_map[row.user_id]["best_duration_seconds"] = row.best_duration_seconds

        # Preserve order from top_member_ids
        top_members = []
        for uid_str in dominion.top_member_ids:
            uid = UUID(uid_str)
            if uid in members_map:
                top_members.append(members_map[uid])

        return {
            "course_id": str(course_id),
            "crew_id": str(crew.id),
            "crew_name": crew.name,
            "crew_logo_url": crew.logo_url,
            "crew_badge_color": crew.badge_color,
            "crew_badge_icon": crew.badge_icon,
            "avg_duration_seconds": dominion.avg_duration_seconds,
            "top_members": top_members,
            "dominated_since": dominion.dominated_since.isoformat(),
            "points_accumulated": dominion.points_accumulated,
        }

    async def get_dominion_brief_for_courses(
        self,
        db: AsyncSession,
        course_ids: list[UUID],
    ) -> dict[str, dict]:
        """Get lightweight dominion info for multiple courses (for map markers)."""
        if not course_ids:
            return {}

        result = await db.execute(
            select(
                CourseDominion.course_id,
                CourseDominion.crew_id,
                CourseDominion.crew_name,
                Crew.badge_color,
                Crew.logo_url,
            )
            .join(Crew, Crew.id == CourseDominion.crew_id)
            .where(CourseDominion.course_id.in_(course_ids))
        )

        return {
            str(row.course_id): {
                "crew_id": str(row.crew_id),
                "crew_name": row.crew_name,
                "crew_badge_color": row.badge_color,
                "crew_logo_url": row.logo_url,
            }
            for row in result.all()
        }

    async def _notify_dominion_gained(
        self,
        db: AsyncSession,
        course_id: UUID,
        crew_id: UUID,
        actor_id: UUID | None,
    ) -> None:
        """Notify all crew members that their crew gained dominion."""
        try:
            from app.services.notification_service import NotificationService
            from app.models.course import Course

            course_result = await db.execute(select(Course.title).where(Course.id == course_id))
            course_title = course_result.scalar_one_or_none() or "코스"

            members_result = await db.execute(
                select(CrewMember.user_id).where(CrewMember.crew_id == crew_id)
            )
            member_ids = [row.user_id for row in members_result.all()]

            notif_service = NotificationService()
            for uid in member_ids:
                await notif_service.create_and_send(
                    db=db,
                    user_id=uid,
                    notification_type="course_dominion_gained",
                    actor_id=actor_id or uid,
                    title="코스 점령!",
                    body=f"크루가 '{course_title}' 코스를 점령했습니다!",
                    target_id=str(course_id),
                    target_type="course",
                )
        except Exception:
            logger.exception("Failed to send dominion gained notification")

    async def _notify_dominion_lost(
        self,
        db: AsyncSession,
        course_id: UUID,
        old_crew_id: UUID,
        new_crew_name: str,
        actor_id: UUID | None,
    ) -> None:
        """Notify all crew members that their crew lost dominion."""
        try:
            from app.services.notification_service import NotificationService
            from app.models.course import Course

            course_result = await db.execute(select(Course.title).where(Course.id == course_id))
            course_title = course_result.scalar_one_or_none() or "코스"

            members_result = await db.execute(
                select(CrewMember.user_id).where(CrewMember.crew_id == old_crew_id)
            )
            member_ids = [row.user_id for row in members_result.all()]

            notif_service = NotificationService()
            for uid in member_ids:
                await notif_service.create_and_send(
                    db=db,
                    user_id=uid,
                    notification_type="course_dominion_lost",
                    actor_id=actor_id or uid,
                    title="코스 점령 빼앗김",
                    body=f"'{course_title}' 코스가 {new_crew_name}에게 점령당했습니다.",
                    target_id=str(course_id),
                    target_type="course",
                )
        except Exception:
            logger.exception("Failed to send dominion lost notification")

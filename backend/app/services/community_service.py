"""Community service: posts, comments, and likes."""

from uuid import UUID

from sqlalchemy import and_, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, PermissionDeniedError
from app.models.community_post import (
    CommunityComment,
    CommunityPost,
    CommunityPostLike,
)
from app.models.crew import Crew, CrewMember


class CommunityService:
    """Handles community posts, comments, and like toggling."""

    async def get_posts(
        self,
        db: AsyncSession,
        page: int = 0,
        per_page: int = 20,
        post_type: str | None = None,
        crew_id: UUID | None = None,
        current_user_id: UUID | None = None,
    ) -> tuple[list[dict], int]:
        """Get paginated list of active community posts.

        Returns:
            Tuple of (post dicts with author info and is_liked flag, total count).
        """
        base_filters = [CommunityPost.is_active.is_(True)]
        if post_type:
            base_filters.append(CommunityPost.post_type == post_type)
        if crew_id:
            base_filters.append(CommunityPost.crew_id == crew_id)

        # Total count
        count_result = await db.execute(
            select(func.count(CommunityPost.id)).where(*base_filters)
        )
        total_count = count_result.scalar_one()

        # Fetch posts
        result = await db.execute(
            select(CommunityPost)
            .where(*base_filters)
            .order_by(CommunityPost.created_at.desc())
            .offset(page * per_page)
            .limit(per_page)
        )
        posts = result.scalars().all()

        # Batch-load liked status for current user
        post_ids = [p.id for p in posts]
        liked_set = await self._get_user_likes(db, post_ids, current_user_id)

        # Batch-load grade levels for crew posts
        grade_map: dict[UUID, int] = {}
        if crew_id and posts:
            user_ids = list({p.user_id for p in posts})
            grade_map = await self._get_crew_grade_map(db, crew_id, user_ids)

        return [
            self._post_to_dict(p, is_liked=p.id in liked_set, grade_map=grade_map)
            for p in posts
        ], total_count

    async def create_post(
        self,
        db: AsyncSession,
        user_id: UUID,
        data: dict,
    ) -> dict:
        """Create a new community post.

        Args:
            db: Database session.
            user_id: Author's user ID.
            data: Fields from CommunityPostCreateRequest.model_dump().

        Returns:
            Post dict with author info.
        """
        crew_id_val = UUID(data["crew_id"]) if data.get("crew_id") else None
        post = CommunityPost(
            user_id=user_id,
            title=data["title"],
            content=data["content"],
            post_type=data.get("post_type", "general"),
            event_id=UUID(data["event_id"]) if data.get("event_id") else None,
            crew_id=crew_id_val,
            image_url=data.get("image_url"),
            image_urls=data.get("image_urls"),
        )
        db.add(post)
        await db.flush()
        await db.refresh(post)

        # Update crew last_activity_at
        if crew_id_val:
            await db.execute(
                update(Crew)
                .where(Crew.id == crew_id_val)
                .values(last_activity_at=func.now())
            )

        # Load grade level for the author in crew context
        grade_map: dict[UUID, int] = {}
        if crew_id_val:
            grade_map = await self._get_crew_grade_map(
                db, crew_id_val, [user_id]
            )

        return self._post_to_dict(post, is_liked=False, grade_map=grade_map)

    async def get_post_detail(
        self,
        db: AsyncSession,
        post_id: UUID,
        current_user_id: UUID | None = None,
    ) -> dict:
        """Get a single post with its first 5 comments.

        Raises:
            NotFoundError: Post does not exist or is inactive.
        """
        result = await db.execute(
            select(CommunityPost).where(
                CommunityPost.id == post_id,
                CommunityPost.is_active.is_(True),
            )
        )
        post = result.scalar_one_or_none()

        if post is None:
            raise NotFoundError(
                code="NOT_FOUND", message="게시글을 찾을 수 없습니다"
            )

        # Check liked status
        liked_set = await self._get_user_likes(
            db, [post.id], current_user_id
        )
        is_liked = post.id in liked_set

        # Fetch first 5 comments
        comments_result = await db.execute(
            select(CommunityComment)
            .where(CommunityComment.post_id == post_id)
            .order_by(CommunityComment.created_at.asc())
            .limit(5)
        )
        comments = comments_result.scalars().all()

        # Batch-load grade levels for crew posts
        grade_map: dict[UUID, int] = {}
        if post.crew_id:
            all_user_ids = list(
                {post.user_id} | {c.user_id for c in comments}
            )
            grade_map = await self._get_crew_grade_map(
                db, post.crew_id, all_user_ids
            )

        post_dict = self._post_to_dict(post, is_liked=is_liked, grade_map=grade_map)
        post_dict["recent_comments"] = [
            self._comment_to_dict(c, grade_map=grade_map) for c in comments
        ]

        return post_dict

    async def update_post(
        self,
        db: AsyncSession,
        post_id: UUID,
        user_id: UUID,
        data: dict,
    ) -> dict:
        """Update a post. Only the author can edit.

        Raises:
            NotFoundError: Post does not exist.
            PermissionDeniedError: User is not the author.
        """
        result = await db.execute(
            select(CommunityPost).where(
                CommunityPost.id == post_id,
                CommunityPost.is_active.is_(True),
            )
        )
        post = result.scalar_one_or_none()

        if post is None:
            raise NotFoundError(
                code="NOT_FOUND", message="게시글을 찾을 수 없습니다"
            )

        if post.user_id != user_id:
            raise PermissionDeniedError(
                code="PERMISSION_DENIED",
                message="본인 게시글만 수정할 수 있습니다",
            )

        for field in ("title", "content", "image_url", "image_urls"):
            if field in data and data[field] is not None:
                setattr(post, field, data[field])

        await db.flush()
        await db.refresh(post)

        liked_set = await self._get_user_likes(db, [post.id], user_id)
        grade_map: dict[UUID, int] = {}
        if post.crew_id:
            grade_map = await self._get_crew_grade_map(
                db, post.crew_id, [user_id]
            )
        return self._post_to_dict(post, is_liked=post.id in liked_set, grade_map=grade_map)

    async def delete_post(
        self,
        db: AsyncSession,
        post_id: UUID,
        user_id: UUID,
    ) -> None:
        """Soft-delete a post.

        Author can always delete their own post.
        Crew admin/owner can delete posts within their crew.

        Raises:
            NotFoundError: Post does not exist.
            PermissionDeniedError: User has no permission.
        """
        result = await db.execute(
            select(CommunityPost).where(CommunityPost.id == post_id)
        )
        post = result.scalar_one_or_none()

        if post is None:
            raise NotFoundError(
                code="NOT_FOUND", message="게시글을 찾을 수 없습니다"
            )

        # Author can always delete
        if post.user_id != user_id:
            # Check crew admin/owner permission
            allowed = False
            if post.crew_id:
                member_result = await db.execute(
                    select(CrewMember).where(
                        CrewMember.crew_id == post.crew_id,
                        CrewMember.user_id == user_id,
                    )
                )
                member = member_result.scalar_one_or_none()
                if member and member.role in ("owner", "admin"):
                    allowed = True

            if not allowed:
                raise PermissionDeniedError(
                    code="PERMISSION_DENIED",
                    message="삭제 권한이 없습니다",
                )

        post.is_active = False
        await db.flush()

    async def get_comments(
        self,
        db: AsyncSession,
        post_id: UUID,
        page: int = 0,
        per_page: int = 20,
    ) -> tuple[list[dict], int]:
        """Get paginated comments for a post.

        Raises:
            NotFoundError: Post does not exist.
        """
        # Verify post exists
        post_result = await db.execute(
            select(CommunityPost.id).where(
                CommunityPost.id == post_id,
                CommunityPost.is_active.is_(True),
            )
        )
        if post_result.scalar_one_or_none() is None:
            raise NotFoundError(
                code="NOT_FOUND", message="게시글을 찾을 수 없습니다"
            )

        # Total count
        count_result = await db.execute(
            select(func.count(CommunityComment.id)).where(
                CommunityComment.post_id == post_id
            )
        )
        total_count = count_result.scalar_one()

        # Fetch comments
        result = await db.execute(
            select(CommunityComment)
            .where(CommunityComment.post_id == post_id)
            .order_by(CommunityComment.created_at.asc())
            .offset(page * per_page)
            .limit(per_page)
        )
        comments = result.scalars().all()

        # Batch-load grade levels if this is a crew post
        grade_map: dict[UUID, int] = {}
        post_row = await db.execute(
            select(CommunityPost.crew_id).where(CommunityPost.id == post_id)
        )
        crew_id = post_row.scalar_one_or_none()
        if crew_id and comments:
            user_ids = list({c.user_id for c in comments})
            grade_map = await self._get_crew_grade_map(db, crew_id, user_ids)

        return [self._comment_to_dict(c, grade_map=grade_map) for c in comments], total_count

    async def create_comment(
        self,
        db: AsyncSession,
        post_id: UUID,
        user_id: UUID,
        content: str,
    ) -> dict:
        """Create a comment and increment the post's comment_count.

        Raises:
            NotFoundError: Post does not exist or is inactive.
        """
        result = await db.execute(
            select(CommunityPost).where(
                CommunityPost.id == post_id,
                CommunityPost.is_active.is_(True),
            )
        )
        post = result.scalar_one_or_none()

        if post is None:
            raise NotFoundError(
                code="NOT_FOUND", message="게시글을 찾을 수 없습니다"
            )

        comment = CommunityComment(
            post_id=post_id,
            user_id=user_id,
            content=content,
        )
        db.add(comment)
        post.comment_count = CommunityPost.comment_count + 1
        await db.flush()
        await db.refresh(comment)

        grade_map: dict[UUID, int] = {}
        if post.crew_id:
            grade_map = await self._get_crew_grade_map(
                db, post.crew_id, [user_id]
            )
        result_dict = self._comment_to_dict(comment, grade_map=grade_map)
        result_dict["post_author_id"] = str(post.user_id)
        return result_dict

    async def delete_comment(
        self,
        db: AsyncSession,
        comment_id: UUID,
        user_id: UUID,
    ) -> None:
        """Delete a comment and decrement the post's comment_count.

        Author, crew owner, or crew admin can delete.

        Raises:
            NotFoundError: Comment does not exist.
            PermissionDeniedError: User lacks permission.
        """
        result = await db.execute(
            select(CommunityComment).where(CommunityComment.id == comment_id)
        )
        comment = result.scalar_one_or_none()

        if comment is None:
            raise NotFoundError(
                code="NOT_FOUND", message="댓글을 찾을 수 없습니다"
            )

        if comment.user_id != user_id:
            # Check if user is crew admin/owner for this post's crew
            post_result = await db.execute(
                select(CommunityPost.crew_id).where(
                    CommunityPost.id == comment.post_id
                )
            )
            crew_id = post_result.scalar_one_or_none()
            allowed = False
            if crew_id:
                member_result = await db.execute(
                    select(CrewMember.role).where(
                        CrewMember.crew_id == crew_id,
                        CrewMember.user_id == user_id,
                    )
                )
                role = member_result.scalar_one_or_none()
                if role in ("owner", "admin"):
                    allowed = True
            if not allowed:
                raise PermissionDeniedError(
                    code="PERMISSION_DENIED",
                    message="댓글을 삭제할 권한이 없습니다",
                )

        # Decrement post comment_count
        post_result = await db.execute(
            select(CommunityPost).where(CommunityPost.id == comment.post_id)
        )
        post = post_result.scalar_one_or_none()
        if post is not None:
            post.comment_count = func.greatest(
                CommunityPost.comment_count - 1, 0
            )

        await db.delete(comment)
        await db.flush()

    async def toggle_like(
        self,
        db: AsyncSession,
        post_id: UUID,
        user_id: UUID,
    ) -> tuple[bool, int, UUID]:
        """Toggle a like on a post.

        Returns:
            Tuple of (is_liked after toggle, new like_count).

        Raises:
            NotFoundError: Post does not exist or is inactive.
        """
        post_result = await db.execute(
            select(CommunityPost).where(
                CommunityPost.id == post_id,
                CommunityPost.is_active.is_(True),
            )
        )
        post = post_result.scalar_one_or_none()

        if post is None:
            raise NotFoundError(
                code="NOT_FOUND", message="게시글을 찾을 수 없습니다"
            )

        # Check if already liked
        existing_result = await db.execute(
            select(CommunityPostLike).where(
                CommunityPostLike.post_id == post_id,
                CommunityPostLike.user_id == user_id,
            )
        )
        existing = existing_result.scalar_one_or_none()

        if existing is not None:
            # Unlike
            await db.delete(existing)
            post.like_count = func.greatest(CommunityPost.like_count - 1, 0)
            await db.flush()
            await db.refresh(post)
            return False, post.like_count, post.user_id
        else:
            # Like
            like = CommunityPostLike(post_id=post_id, user_id=user_id)
            db.add(like)
            post.like_count = CommunityPost.like_count + 1
            await db.flush()
            await db.refresh(post)
            return True, post.like_count, post.user_id

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    async def _get_user_likes(
        self,
        db: AsyncSession,
        post_ids: list[UUID],
        user_id: UUID | None,
    ) -> set[UUID]:
        """Get the set of post IDs that a user has liked."""
        if not post_ids or user_id is None:
            return set()

        result = await db.execute(
            select(CommunityPostLike.post_id).where(
                CommunityPostLike.post_id.in_(post_ids),
                CommunityPostLike.user_id == user_id,
            )
        )
        return {row[0] for row in result.all()}

    @staticmethod
    def _post_to_dict(
        post: CommunityPost,
        *,
        is_liked: bool,
        grade_map: dict | None = None,
    ) -> dict:
        """Convert a CommunityPost ORM object to a response dict."""
        user = post.user
        return {
            "id": str(post.id),
            "author": {
                "id": str(user.id) if user else "",
                "nickname": user.nickname if user else None,
                "avatar_url": user.avatar_url if user else None,
                "crew_name": user.crew_name if user else None,
                "crew_grade_level": (grade_map or {}).get(post.user_id),
            },
            "title": post.title,
            "content": post.content,
            "post_type": post.post_type,
            "event_id": str(post.event_id) if post.event_id else None,
            "crew_id": str(post.crew_id) if post.crew_id else None,
            "image_url": post.image_url,
            "image_urls": post.image_urls,
            "like_count": post.like_count,
            "comment_count": post.comment_count,
            "is_liked": is_liked,
            "created_at": post.created_at,
            "updated_at": post.updated_at,
        }

    @staticmethod
    def _comment_to_dict(
        comment: CommunityComment,
        *,
        grade_map: dict | None = None,
    ) -> dict:
        """Convert a CommunityComment ORM object to a response dict."""
        user = comment.user
        return {
            "id": str(comment.id),
            "post_id": str(comment.post_id),
            "author": {
                "id": str(user.id) if user else "",
                "nickname": user.nickname if user else None,
                "avatar_url": user.avatar_url if user else None,
                "crew_name": user.crew_name if user else None,
                "crew_grade_level": (grade_map or {}).get(comment.user_id),
            },
            "content": comment.content,
            "created_at": comment.created_at,
        }

    @staticmethod
    async def _get_crew_grade_map(
        db: AsyncSession,
        crew_id: UUID,
        user_ids: list[UUID],
    ) -> dict[UUID, int]:
        """Batch-load crew grade levels for a list of user IDs."""
        if not user_ids:
            return {}
        result = await db.execute(
            select(CrewMember.user_id, CrewMember.grade_level).where(
                CrewMember.crew_id == crew_id,
                CrewMember.user_id.in_(user_ids),
            )
        )
        return {row[0]: row[1] for row in result.all()}

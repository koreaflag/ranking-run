"""Contact service: phone hash registration and contact-based friend matching."""

import re
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.models.follow import Follow
from app.models.user import User


class ContactService:
    """Handles phone hash registration and contact-based friend recommendations."""

    async def set_phone_hash(
        self,
        db: AsyncSession,
        user_id: UUID,
        phone_hash: str,
    ) -> User:
        """Store a SHA-256 phone number hash for the user.

        Raises:
            NotFoundError: User does not exist.
            ValidationError: Hash format is invalid.
            ConflictError: Hash is already registered by another user.
        """
        if not re.fullmatch(r"[0-9a-f]{64}", phone_hash):
            raise ValidationError(
                code="INVALID_HASH_FORMAT",
                message="phone_hash는 64자리 소문자 16진수(SHA-256)여야 합니다",
            )

        # Check if the hash is already taken by another user
        existing = await db.execute(
            select(User.id).where(
                User.phone_number_hash == phone_hash,
                User.id != user_id,
            )
        )
        if existing.scalar_one_or_none() is not None:
            raise ConflictError(
                code="HASH_ALREADY_REGISTERED",
                message="이 전화번호는 이미 다른 계정에 등록되어 있습니다",
            )

        # Fetch and update the user
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user is None:
            raise NotFoundError(
                code="NOT_FOUND", message="사용자를 찾을 수 없습니다"
            )

        user.phone_number_hash = phone_hash
        await db.flush()
        return user

    async def remove_phone_hash(
        self,
        db: AsyncSession,
        user_id: UUID,
    ) -> None:
        """Remove the phone number hash for the user.

        Raises:
            NotFoundError: User does not exist.
        """
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user is None:
            raise NotFoundError(
                code="NOT_FOUND", message="사용자를 찾을 수 없습니다"
            )

        user.phone_number_hash = None
        await db.flush()

    async def match_contacts(
        self,
        db: AsyncSession,
        current_user_id: UUID,
        contact_hashes: list[str],
    ) -> tuple[list[User], int]:
        """Match contact hashes against registered users.

        Excludes:
        - The current user
        - Users already followed by the current user
        - Users without a nickname (incomplete profiles)

        Args:
            db: Async database session.
            current_user_id: The requesting user's ID.
            contact_hashes: List of SHA-256 hashes (max 5000).

        Returns:
            Tuple of (matched users list, total match count).
        """
        # Cap at 5000 hashes
        hashes = contact_hashes[:5000]

        if not hashes:
            return [], 0

        # Filter to valid 64-char hex strings only
        valid_hashes = [h for h in hashes if re.fullmatch(r"[0-9a-f]{64}", h)]
        if not valid_hashes:
            return [], 0

        # Subquery: IDs of users that the current user already follows
        following_ids = (
            select(Follow.following_id)
            .where(Follow.follower_id == current_user_id)
            .scalar_subquery()
        )

        # Match hashes, excluding self, already-followed, and incomplete profiles
        query = (
            select(User)
            .where(
                User.phone_number_hash.in_(valid_hashes),
                User.id != current_user_id,
                User.id.notin_(following_ids),
                User.nickname.isnot(None),
            )
            .order_by(User.nickname)
            .limit(100)
        )

        result = await db.execute(query)
        users = list(result.scalars().all())
        total_count = len(users)

        return users, total_count

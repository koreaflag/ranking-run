"""Gear service: CRUD operations for user running gear (shoes)."""

from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, PermissionDeniedError
from app.models.gear import UserGear


class GearService:
    """Handles running gear CRUD and primary-gear toggling."""

    async def list_user_gear(
        self,
        db: AsyncSession,
        user_id: UUID,
    ) -> list[UserGear]:
        """Return all gear items for a user, primary first."""
        result = await db.execute(
            select(UserGear)
            .where(UserGear.user_id == user_id)
            .order_by(UserGear.is_primary.desc(), UserGear.created_at.desc())
        )
        return list(result.scalars().all())

    async def create_gear(
        self,
        db: AsyncSession,
        user_id: UUID,
        brand: str,
        model_name: str,
        image_url: str | None = None,
        is_primary: bool = False,
    ) -> UserGear:
        """Create a new gear entry.

        If is_primary is True, any existing primary gear for the user
        is demoted first to maintain the single-primary invariant.
        """
        if is_primary:
            await self._clear_primary(db, user_id)

        gear = UserGear(
            user_id=user_id,
            brand=brand,
            model_name=model_name,
            image_url=image_url,
            is_primary=is_primary,
        )
        db.add(gear)
        await db.flush()

        # Re-query to populate server-generated columns (id, created_at)
        result = await db.execute(
            select(UserGear)
            .where(UserGear.id == gear.id)
            .execution_options(populate_existing=True)
        )
        return result.scalar_one()

    async def update_gear(
        self,
        db: AsyncSession,
        user_id: UUID,
        gear_id: UUID,
        brand: str | None = None,
        model_name: str | None = None,
        image_url: str | None = None,
        is_primary: bool | None = None,
    ) -> UserGear:
        """Update an existing gear entry.

        Raises:
            NotFoundError: Gear does not exist.
            PermissionDeniedError: User does not own this gear.
        """
        gear = await self._get_owned_gear(db, user_id, gear_id)

        if brand is not None:
            gear.brand = brand
        if model_name is not None:
            gear.model_name = model_name
        if image_url is not None:
            gear.image_url = image_url
        if is_primary is not None and is_primary and not gear.is_primary:
            await self._clear_primary(db, user_id)
            gear.is_primary = True
        elif is_primary is not None and not is_primary:
            gear.is_primary = False

        await db.flush()

        result = await db.execute(
            select(UserGear)
            .where(UserGear.id == gear.id)
            .execution_options(populate_existing=True)
        )
        return result.scalar_one()

    async def delete_gear(
        self,
        db: AsyncSession,
        user_id: UUID,
        gear_id: UUID,
    ) -> None:
        """Delete a gear entry.

        Raises:
            NotFoundError: Gear does not exist.
            PermissionDeniedError: User does not own this gear.
        """
        gear = await self._get_owned_gear(db, user_id, gear_id)
        await db.delete(gear)
        await db.flush()

    async def get_primary_gear(
        self,
        db: AsyncSession,
        user_id: UUID,
    ) -> UserGear | None:
        """Return the user's primary gear, or None."""
        result = await db.execute(
            select(UserGear).where(
                UserGear.user_id == user_id,
                UserGear.is_primary == True,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _get_owned_gear(
        self,
        db: AsyncSession,
        user_id: UUID,
        gear_id: UUID,
    ) -> UserGear:
        """Fetch a gear item and verify ownership.

        Raises:
            NotFoundError: Gear does not exist.
            PermissionDeniedError: User does not own this gear.
        """
        result = await db.execute(
            select(UserGear).where(UserGear.id == gear_id)
        )
        gear = result.scalar_one_or_none()

        if gear is None:
            raise NotFoundError(code="NOT_FOUND", message="기어를 찾을 수 없습니다")

        if gear.user_id != user_id:
            raise PermissionDeniedError(
                code="FORBIDDEN", message="본인의 기어만 수정/삭제할 수 있습니다"
            )

        return gear

    async def _clear_primary(
        self,
        db: AsyncSession,
        user_id: UUID,
    ) -> None:
        """Demote the current primary gear for a user (if any)."""
        await db.execute(
            update(UserGear)
            .where(
                UserGear.user_id == user_id,
                UserGear.is_primary == True,  # noqa: E712
            )
            .values(is_primary=False)
        )

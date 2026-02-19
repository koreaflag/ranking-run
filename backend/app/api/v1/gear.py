"""Gear endpoints: running shoes CRUD and brand listing."""

from uuid import UUID

from dependency_injector.wiring import inject, Provide
from fastapi import APIRouter, Depends, status

from app.core.container import Container
from app.core.deps import CurrentUser, DbSession
from app.schemas.gear import (
    GearBrandsResponse,
    GearCreateRequest,
    GearResponse,
    GearUpdateRequest,
    SHOE_BRANDS,
)
from app.services.gear_service import GearService

router = APIRouter(prefix="/gear", tags=["gear"])


@router.get("/brands", response_model=GearBrandsResponse)
async def get_brands() -> GearBrandsResponse:
    """Return the list of supported shoe brands."""
    return GearBrandsResponse(brands=SHOE_BRANDS)


@router.get("", response_model=list[GearResponse])
@inject
async def list_my_gear(
    current_user: CurrentUser,
    db: DbSession,
    gear_service: GearService = Depends(Provide[Container.gear_service]),
) -> list[GearResponse]:
    """List the current user's registered gear."""
    items = await gear_service.list_user_gear(db, current_user.id)
    return [GearResponse.model_validate(g) for g in items]


@router.post("", response_model=GearResponse, status_code=status.HTTP_201_CREATED)
@inject
async def create_gear(
    body: GearCreateRequest,
    current_user: CurrentUser,
    db: DbSession,
    gear_service: GearService = Depends(Provide[Container.gear_service]),
) -> GearResponse:
    """Register a new gear item for the current user."""
    gear = await gear_service.create_gear(
        db=db,
        user_id=current_user.id,
        brand=body.brand,
        model_name=body.model_name,
        image_url=body.image_url,
        is_primary=body.is_primary,
    )
    return GearResponse.model_validate(gear)


@router.patch("/{gear_id}", response_model=GearResponse)
@inject
async def update_gear(
    gear_id: UUID,
    body: GearUpdateRequest,
    current_user: CurrentUser,
    db: DbSession,
    gear_service: GearService = Depends(Provide[Container.gear_service]),
) -> GearResponse:
    """Update an existing gear item (ownership verified)."""
    gear = await gear_service.update_gear(
        db=db,
        user_id=current_user.id,
        gear_id=gear_id,
        brand=body.brand,
        model_name=body.model_name,
        image_url=body.image_url,
        is_primary=body.is_primary,
    )
    return GearResponse.model_validate(gear)


@router.delete("/{gear_id}", status_code=status.HTTP_204_NO_CONTENT)
@inject
async def delete_gear(
    gear_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    gear_service: GearService = Depends(Provide[Container.gear_service]),
) -> None:
    """Delete a gear item (ownership verified)."""
    await gear_service.delete_gear(
        db=db,
        user_id=current_user.id,
        gear_id=gear_id,
    )


# --- Public gear listing (under /users prefix) ---

public_router = APIRouter(prefix="/users", tags=["gear"])


@public_router.get("/{user_id}/gear", response_model=list[GearResponse])
@inject
async def list_user_gear(
    user_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    gear_service: GearService = Depends(Provide[Container.gear_service]),
) -> list[GearResponse]:
    """List a specific user's gear (public profile view)."""
    items = await gear_service.list_user_gear(db, user_id)
    return [GearResponse.model_validate(g) for g in items]

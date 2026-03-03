"""Contact endpoints: phone hash registration and contact-based friend matching."""

from dependency_injector.wiring import inject, Provide
from fastapi import APIRouter, Depends

from app.core.container import Container
from app.core.deps import CurrentUser, DbSession
from app.schemas.contact import (
    ContactMatchUser,
    MatchContactsRequest,
    MatchContactsResponse,
    PhoneHashStatusResponse,
    SetPhoneHashRequest,
)
from app.services.contact_service import ContactService

router = APIRouter(tags=["contacts"])


@router.get("/contacts/phone-hash-status", response_model=PhoneHashStatusResponse)
@inject
async def get_phone_hash_status(
    current_user: CurrentUser,
    db: DbSession,
    contact_service: ContactService = Depends(Provide[Container.contact_service]),
) -> PhoneHashStatusResponse:
    """Check if the authenticated user has registered a phone number hash."""
    return PhoneHashStatusResponse(
        has_phone_hash=current_user.phone_number_hash is not None,
    )


@router.put("/contacts/phone-hash", response_model=PhoneHashStatusResponse)
@inject
async def set_phone_hash(
    body: SetPhoneHashRequest,
    current_user: CurrentUser,
    db: DbSession,
    contact_service: ContactService = Depends(Provide[Container.contact_service]),
) -> PhoneHashStatusResponse:
    """Register or update the authenticated user's phone number hash."""
    await contact_service.set_phone_hash(
        db=db,
        user_id=current_user.id,
        phone_hash=body.phone_hash,
    )
    return PhoneHashStatusResponse(has_phone_hash=True)


@router.delete("/contacts/phone-hash", status_code=204)
@inject
async def remove_phone_hash(
    current_user: CurrentUser,
    db: DbSession,
    contact_service: ContactService = Depends(Provide[Container.contact_service]),
) -> None:
    """Remove the authenticated user's phone number hash."""
    await contact_service.remove_phone_hash(
        db=db,
        user_id=current_user.id,
    )


@router.post("/contacts/match", response_model=MatchContactsResponse)
@inject
async def match_contacts(
    body: MatchContactsRequest,
    current_user: CurrentUser,
    db: DbSession,
    contact_service: ContactService = Depends(Provide[Container.contact_service]),
) -> MatchContactsResponse:
    """Match contact phone hashes against registered users for friend recommendations."""
    users, total_count = await contact_service.match_contacts(
        db=db,
        current_user_id=current_user.id,
        contact_hashes=body.contact_hashes,
    )
    return MatchContactsResponse(
        matches=[
            ContactMatchUser(
                id=str(u.id),
                nickname=u.nickname,
                avatar_url=u.avatar_url,
                bio=u.bio,
                total_distance_meters=u.total_distance_meters,
                total_runs=u.total_runs,
            )
            for u in users
        ],
        total_count=total_count,
    )

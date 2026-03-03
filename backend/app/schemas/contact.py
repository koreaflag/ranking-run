"""Contact matching request/response schemas."""

import re

from pydantic import BaseModel, field_validator


class SetPhoneHashRequest(BaseModel):
    """Request to register a phone number hash."""

    phone_hash: str

    @field_validator("phone_hash")
    @classmethod
    def validate_phone_hash(cls, v: str) -> str:
        if not re.fullmatch(r"[0-9a-f]{64}", v):
            raise ValueError("phone_hash must be a 64-character lowercase hex string (SHA-256)")
        return v


class MatchContactsRequest(BaseModel):
    """Request to match contact hashes against registered users."""

    contact_hashes: list[str]

    @field_validator("contact_hashes")
    @classmethod
    def validate_contact_hashes(cls, v: list[str]) -> list[str]:
        if len(v) > 5000:
            raise ValueError("최대 5000개의 연락처만 매칭할 수 있습니다")
        return v


class ContactMatchUser(BaseModel):
    """A matched user from the contact list."""

    id: str
    nickname: str | None
    avatar_url: str | None
    bio: str | None
    total_distance_meters: int
    total_runs: int


class MatchContactsResponse(BaseModel):
    """Response containing matched users from the contact list."""

    matches: list[ContactMatchUser]
    total_count: int


class PhoneHashStatusResponse(BaseModel):
    """Response indicating whether the user has registered a phone hash."""

    has_phone_hash: bool

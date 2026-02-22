"""Gear (running shoes) schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


SHOE_BRANDS = [
    "Nike", "Adidas", "New Balance", "Asics", "Hoka",
    "Brooks", "Saucony", "On", "Mizuno", "Puma",
    "Under Armour", "Reebok", "Salomon", "Altra", "기타",
]


class GearCreateRequest(BaseModel):
    brand: str = Field(..., min_length=1, max_length=50)
    model_name: str = Field(..., min_length=1, max_length=100)
    image_url: str | None = None
    is_primary: bool = False


class GearUpdateRequest(BaseModel):
    brand: str | None = Field(None, min_length=1, max_length=50)
    model_name: str | None = Field(None, min_length=1, max_length=100)
    image_url: str | None = None
    is_primary: bool | None = None


class GearResponse(BaseModel):
    id: UUID
    brand: str
    model_name: str
    image_url: str | None = None
    is_primary: bool
    total_distance_meters: float
    created_at: datetime

    model_config = {"from_attributes": True}


class GearBrandsResponse(BaseModel):
    brands: list[str]

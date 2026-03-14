"""Point transaction schemas."""

from datetime import datetime

from pydantic import BaseModel


class PointTransactionItem(BaseModel):
    id: str
    amount: int
    balance_after: int
    tx_type: str
    description: str | None = None
    created_at: datetime


class PointHistoryResponse(BaseModel):
    data: list[PointTransactionItem]
    total_count: int
    has_next: bool

"""Crew level configuration — single source of truth for level-based gating."""

CREW_LEVEL_THRESHOLDS = [
    0, 100_000, 500_000, 1_500_000, 5_000_000,
    15_000_000, 50_000_000, 150_000_000, 500_000_000, 1_000_000_000,
]

CREW_MAX_MEMBERS: dict[int, int | None] = {
    1: 10, 2: 20, 3: 30, 4: 50, 5: 80,
    6: 120, 7: 200, 8: 300, 9: None, 10: None,
}

CREW_MAX_CHALLENGES: dict[int, int] = {
    1: 1, 2: 1, 3: 1, 4: 2, 5: 2,
    6: 3, 7: 5, 8: 5, 9: 999, 10: 999,
}

FEATURE_LEVELS = {
    "badge_color": 3,
    "cover_image": 3,
    "grade_name_custom": 4,
}


def get_max_members(level: int) -> int | None:
    return CREW_MAX_MEMBERS.get(level, 10)


def get_max_active_challenges(level: int) -> int:
    return CREW_MAX_CHALLENGES.get(level, 1)


def is_feature_unlocked(crew_level: int, feature: str) -> bool:
    req = FEATURE_LEVELS.get(feature)
    if req is None:
        return True
    return crew_level >= req

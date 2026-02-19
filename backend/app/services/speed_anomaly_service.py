"""Speed anomaly detection — flags runs with inhuman speed patterns.

Human running speed limits (conservative thresholds):
- Usain Bolt peak: 12.4 m/s (44.7 km/h) — 100m sprint, unsustainable
- Elite sprinter 400m: ~9.3 m/s (33.5 km/h)
- Elite 1500m: ~7.0 m/s (25.2 km/h)
- Marathon world record: ~5.7 m/s (20.5 km/h)
- Average recreational runner: 2.5-4.0 m/s (9-14.4 km/h)

Detection rules:
1. Average speed impossibly fast for the distance
2. Any split faster than physically possible
3. Max instantaneous speed too high (sustained)
"""

from dataclasses import dataclass


@dataclass
class AnomalyResult:
    is_flagged: bool
    flag_reason: str | None = None
    confidence: float = 0.0  # 0.0 ~ 1.0


# Speed limits per distance bracket (in m/s)
# These are ~5% faster than world records — anyone exceeding is cheating
_DISTANCE_SPEED_LIMITS = [
    # (min_distance_m, max_avg_speed_ms, description)
    (0, 10.5, "단거리"),         # Under any distance: 10.5 m/s (37.8 km/h)
    (1000, 7.5, "1km+"),        # 1km+: 7.5 m/s (27 km/h) — faster than WR 1500m
    (5000, 6.8, "5km+"),        # 5km+: 6.8 m/s (24.5 km/h) — faster than WR 5K
    (10000, 6.3, "10km+"),      # 10km+: 6.3 m/s (22.7 km/h) — faster than WR 10K
    (21097, 6.0, "하프마라톤+"),  # Half: 6.0 m/s (21.6 km/h)
    (42195, 5.8, "풀마라톤+"),   # Full: 5.8 m/s (20.9 km/h)
]

# Minimum split pace (seconds/km) — anything faster is impossible
# 2:00/km = 120 sec/km ≈ 8.33 m/s — extremely generous, real WR 1km is ~2:11
_MIN_SPLIT_PACE_SEC_PER_KM = 120

# Max instantaneous speed that a human can produce (m/s)
# 12.5 m/s is just above Bolt's peak — generous threshold
_MAX_INSTANTANEOUS_SPEED_MS = 12.5


def analyze_run(
    distance_meters: int,
    duration_seconds: int,
    avg_speed_ms: float | None,
    max_speed_ms: float | None,
    splits: list[dict] | None,
    best_pace_seconds_per_km: int | None,
) -> AnomalyResult:
    """Analyze a completed run for speed anomalies.

    Returns AnomalyResult with is_flagged=True if cheating is suspected.
    """
    reasons: list[str] = []

    if duration_seconds <= 0 or distance_meters <= 0:
        return AnomalyResult(is_flagged=False)

    # --- Check 1: Average speed vs distance bracket ---
    actual_avg = distance_meters / duration_seconds
    if avg_speed_ms and avg_speed_ms > 0:
        actual_avg = max(actual_avg, avg_speed_ms)

    speed_limit = _MAX_INSTANTANEOUS_SPEED_MS  # fallback
    bracket_name = ""
    for min_dist, limit, name in reversed(_DISTANCE_SPEED_LIMITS):
        if distance_meters >= min_dist:
            speed_limit = limit
            bracket_name = name
            break

    if actual_avg > speed_limit:
        reasons.append(
            f"평균 속도 {actual_avg:.1f}m/s가 {bracket_name} 인간 한계 "
            f"{speed_limit:.1f}m/s를 초과"
        )

    # --- Check 2: Max instantaneous speed ---
    if max_speed_ms and max_speed_ms > _MAX_INSTANTANEOUS_SPEED_MS:
        reasons.append(
            f"최고 순간 속도 {max_speed_ms:.1f}m/s가 인간 한계 "
            f"{_MAX_INSTANTANEOUS_SPEED_MS}m/s를 초과"
        )

    # --- Check 3: Best split pace ---
    if best_pace_seconds_per_km and best_pace_seconds_per_km < _MIN_SPLIT_PACE_SEC_PER_KM:
        mins = best_pace_seconds_per_km // 60
        secs = best_pace_seconds_per_km % 60
        reasons.append(
            f"최고 구간 페이스 {mins}:{secs:02d}/km이 인간 한계 2:00/km보다 빠름"
        )

    # --- Check 4: Individual split analysis ---
    if splits:
        for split in splits:
            pace = split.get("pace_seconds_per_km", 0)
            split_num = split.get("split_number", "?")
            if pace > 0 and pace < _MIN_SPLIT_PACE_SEC_PER_KM:
                mins = pace // 60
                secs = pace % 60
                reasons.append(
                    f"{split_num}km 구간 페이스 {mins}:{secs:02d}/km이 비정상"
                )
                break  # One is enough

    if reasons:
        return AnomalyResult(
            is_flagged=True,
            flag_reason=" / ".join(reasons[:3]),  # max 3 reasons
            confidence=min(1.0, len(reasons) * 0.4),
        )

    return AnomalyResult(is_flagged=False)

// ============================================================
// Formatting Utilities
// ============================================================

/**
 * Converts pace (seconds per km) to a display string like "5'30\""
 */
export function formatPace(secondsPerKm: number | null | undefined): string {
  if (secondsPerKm == null || secondsPerKm <= 0) return '--\'--"';
  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = Math.floor(secondsPerKm % 60);
  return `${minutes}'${seconds.toString().padStart(2, '0')}"`;
}

/**
 * Converts distance in meters to a display string.
 * Under 1000m: "850m", 1000m+: "3.25km"
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  return `${(meters / 1000).toFixed(2)}km`;
}

/**
 * Converts distance in meters to km with fixed decimal places.
 */
export function metersToKm(meters: number, decimals: number = 2): string {
  return (meters / 1000).toFixed(decimals);
}

/**
 * Converts duration in seconds to "HH:MM:SS" or "MM:SS" format.
 */
export function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Converts an ISO date string to a Korean-friendly relative time.
 * e.g., "방금 전", "5분 전", "3시간 전", "2일 전", "2026.01.15"
 */
export function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return '방금 전';
  if (diffMinutes < 60) return `${diffMinutes}분 전`;
  if (diffHours < 24) return `${diffHours}시간 전`;
  if (diffDays < 7) return `${diffDays}일 전`;

  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}.${month}.${day}`;
}

/**
 * Formats a date string to "YYYY.MM.DD" format.
 */
export function formatDate(isoString: string): string {
  const date = new Date(isoString);
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}.${month}.${day}`;
}

/**
 * Formats a number with commas for thousands separator.
 */
export function formatNumber(num: number): string {
  return num.toLocaleString('ko-KR');
}

/**
 * Calculates estimated calories burned from distance and duration.
 * Rough estimate: ~60 kcal per km for a 65kg person.
 */
export function estimateCalories(distanceMeters: number): number {
  return Math.round((distanceMeters / 1000) * 60);
}

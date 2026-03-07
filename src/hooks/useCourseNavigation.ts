import { useRef, useMemo } from 'react';
import { haversineDistance, bearing } from '../utils/geo';
import type { Coordinate } from '../utils/geo';
import {
  extractTurnPoints,
  computeCumulativeDistances,
} from '../utils/turnPointAnalyzer';
import type { TurnPoint, TurnDirection } from '../utils/turnPointAnalyzer';

export type { TurnDirection } from '../utils/turnPointAnalyzer';

export type NavDirection = 'straight' | 'left' | 'right' | 'u-turn';

export interface CourseNavigation {
  nearestPointIndex: number;
  deviationMeters: number;
  isOffCourse: boolean;
  bearingToNext: number;
  /** Bearing from current position to the nearest point on the course (for return guidance) */
  bearingToCourse: number;
  remainingDistanceMeters: number;
  progressPercent: number;
  nextDirection: NavDirection;

  // Turn-point navigation
  turnPoints: TurnPoint[];
  currentTurnIndex: number;
  distanceToNextTurn: number;
  nextTurnDirection: TurnDirection;
  instructionsRemaining: number;
}

const OFF_COURSE_THRESHOLD = 30; // meters
const LOOK_AHEAD_DISTANCE_M = 30; // meters (distance-based instead of fixed points)
const SEARCH_WINDOW_BACK = 5;
const SEARCH_WINDOW_FORWARD = 20;

function classifyDirection(bearingDiff: number): NavDirection {
  // bearingDiff is -180 to 180
  const abs = Math.abs(bearingDiff);
  if (abs < 30) return 'straight';
  if (abs > 150) return 'u-turn';
  return bearingDiff > 0 ? 'right' : 'left';
}

/**
 * Map a granular TurnDirection to the coarser NavDirection
 * for backward compatibility.
 */
function turnDirectionToNavDirection(dir: TurnDirection): NavDirection {
  switch (dir) {
    case 'slight-left':
    case 'left':
    case 'sharp-left':
      return 'left';
    case 'slight-right':
    case 'right':
    case 'sharp-right':
      return 'right';
    case 'u-turn':
      return 'u-turn';
    case 'straight':
    default:
      return 'straight';
  }
}

/** Project point p onto segment a→b. Returns projected point and parameter t ∈ [0,1]. */
function projectOnSegment(
  p: Coordinate,
  a: Coordinate,
  b: Coordinate,
): { projected: Coordinate; t: number } {
  const dx = b.longitude - a.longitude;
  const dy = b.latitude - a.latitude;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-14) return { projected: a, t: 0 };
  const t = Math.max(0, Math.min(1,
    ((p.longitude - a.longitude) * dx + (p.latitude - a.latitude) * dy) / lenSq,
  ));
  return {
    projected: {
      latitude: a.latitude + t * dy,
      longitude: a.longitude + t * dx,
    },
    t,
  };
}

export function useCourseNavigation(
  courseRoute: Coordinate[] | null,
  currentLocation: Coordinate | null,
  currentBearing: number,
): CourseNavigation | null {
  const lastIndexRef = useRef(0);
  const lastLocationRef = useRef<Coordinate | null>(null);
  const lastResultRef = useRef<CourseNavigation | null>(null);

  // Pre-compute turn points and cumulative distances once per route change.
  // These are pure functions of the route and never depend on the runner's
  // current position, so they belong in their own useMemo.
  const turnPoints = useMemo(() => {
    if (!courseRoute || courseRoute.length < 2) return [];
    return extractTurnPoints(courseRoute);
  }, [courseRoute]);

  const cumulativeDistances = useMemo(() => {
    if (!courseRoute || courseRoute.length < 2) return [];
    return computeCumulativeDistances(courseRoute);
  }, [courseRoute]);

  return useMemo(() => {
    if (!courseRoute || courseRoute.length < 2 || !currentLocation) return null;

    // Skip re-computation if position moved less than 1m
    if (lastLocationRef.current && lastResultRef.current) {
      const moved = haversineDistance(currentLocation, lastLocationRef.current);
      if (moved < 1) return lastResultRef.current;
    }
    lastLocationRef.current = currentLocation;

    // Find nearest point on course (forward-biased windowed search)
    const lastIdx = lastIndexRef.current;
    // Full search when starting or when far off course
    const pointDist = haversineDistance(currentLocation, courseRoute[lastIdx]);
    const fullSearch = lastIdx === 0 || pointDist > OFF_COURSE_THRESHOLD * 2;
    const searchStart = fullSearch ? 0 : Math.max(0, lastIdx - SEARCH_WINDOW_BACK);
    const searchEnd = fullSearch ? courseRoute.length - 1 : Math.min(courseRoute.length - 1, lastIdx + SEARCH_WINDOW_FORWARD);

    let nearestIdx = lastIdx;
    let nearestDist = Infinity;

    for (let i = searchStart; i <= searchEnd; i++) {
      const dist = haversineDistance(currentLocation, courseRoute[i]);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIdx = i;
      }
    }

    // Prevent backward regression when on-course
    if (nearestIdx < lastIdx && nearestDist <= OFF_COURSE_THRESHOLD) {
      nearestIdx = lastIdx;
      nearestDist = haversineDistance(currentLocation, courseRoute[lastIdx]);
    }

    // Segment projection for precise deviation measurement
    let deviationMeters = nearestDist;
    let projectedProgress = 0; // fractional extra distance past nearestIdx

    if (nearestIdx < courseRoute.length - 1) {
      const a = courseRoute[nearestIdx];
      const b = courseRoute[nearestIdx + 1];
      const proj = projectOnSegment(currentLocation, a, b);
      const projDist = haversineDistance(currentLocation, proj.projected);
      if (projDist < deviationMeters) {
        deviationMeters = projDist;
        projectedProgress = proj.t * haversineDistance(a, b);
      }
    }
    if (nearestIdx > 0) {
      const a = courseRoute[nearestIdx - 1];
      const b = courseRoute[nearestIdx];
      const proj = projectOnSegment(currentLocation, a, b);
      const projDist = haversineDistance(currentLocation, proj.projected);
      if (projDist < deviationMeters) {
        deviationMeters = projDist;
        projectedProgress = -(1 - proj.t) * haversineDistance(a, b);
      }
    }

    lastIndexRef.current = nearestIdx;

    const isOffCourse = deviationMeters > OFF_COURSE_THRESHOLD;

    // Remaining distance — O(1) via pre-computed cumulative distances
    const totalDistance = cumulativeDistances.length > 0
      ? cumulativeDistances[cumulativeDistances.length - 1]
      : 0;
    const distAtNearest = cumulativeDistances.length > nearestIdx
      ? cumulativeDistances[nearestIdx]
      : 0;
    const segmentRemaining = totalDistance - distAtNearest;
    const remainingDistanceMeters = Math.max(0, segmentRemaining - projectedProgress);
    const coveredDistance = totalDistance - remainingDistanceMeters;
    const progressPercent = totalDistance > 0 ? Math.min(100, Math.max(0, (coveredDistance / totalDistance) * 100)) : 0;

    // Distance-based look-ahead (30m ahead, independent of point density)
    let lookAheadIdx = nearestIdx + 1;
    let accDist = 0;
    while (lookAheadIdx < courseRoute.length - 1 && accDist < LOOK_AHEAD_DISTANCE_M) {
      accDist += haversineDistance(courseRoute[lookAheadIdx], courseRoute[lookAheadIdx + 1]);
      lookAheadIdx++;
    }
    lookAheadIdx = Math.min(lookAheadIdx, courseRoute.length - 1);
    const bearingToNext = bearing(currentLocation, courseRoute[lookAheadIdx]);

    // Direction classification based on difference between current bearing and target
    let bearingDiff = bearingToNext - currentBearing;
    if (bearingDiff > 180) bearingDiff -= 360;
    if (bearingDiff < -180) bearingDiff += 360;

    // ---- Turn-point navigation ----
    // Find currentTurnIndex: the last turn point whose index <= nearestIdx
    let currentTurnIndex = 0;
    for (let t = turnPoints.length - 1; t >= 0; t--) {
      if (turnPoints[t].index <= nearestIdx) {
        currentTurnIndex = t;
        break;
      }
    }

    // Determine the next turn after the current position
    const nextTurnIndex = currentTurnIndex + 1;
    const hasNextTurn = nextTurnIndex < turnPoints.length;

    // Distance from runner's current position (on the polyline) to the next turn
    const runnerCumulativeDist =
      cumulativeDistances.length > nearestIdx
        ? cumulativeDistances[nearestIdx]
        : 0;

    const distanceToNextTurn = hasNextTurn
      ? turnPoints[nextTurnIndex].distanceFromStart - runnerCumulativeDist
      : -1;

    const nextTurnDirection: TurnDirection = hasNextTurn
      ? turnPoints[nextTurnIndex].direction
      : 'straight';

    const instructionsRemaining = hasNextTurn
      ? turnPoints.length - nextTurnIndex
      : 0;

    // Use turn-point direction for the backward-compat nextDirection when
    // there is an upcoming turn within a reasonable distance; otherwise
    // fall back to the bearing-based classification.
    const nextDirection =
      hasNextTurn && distanceToNextTurn >= 0 && distanceToNextTurn <= 200
        ? turnDirectionToNavDirection(nextTurnDirection)
        : classifyDirection(bearingDiff);

    const result: CourseNavigation = {
      nearestPointIndex: nearestIdx,
      deviationMeters,
      isOffCourse,
      bearingToNext,
      bearingToCourse: bearing(currentLocation, courseRoute[nearestIdx]),
      remainingDistanceMeters,
      progressPercent,
      nextDirection,
      turnPoints,
      currentTurnIndex,
      distanceToNextTurn,
      nextTurnDirection,
      instructionsRemaining,
    };
    lastResultRef.current = result;
    return result;
  }, [courseRoute, currentLocation, currentBearing, turnPoints, cumulativeDistances]);
}

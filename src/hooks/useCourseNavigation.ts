import { useRef, useMemo } from 'react';
import { haversineDistance, bearing, polylineDistance } from '../utils/geo';
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
const LOOK_AHEAD_POINTS = 5;
const SEARCH_WINDOW = 20;

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

export function useCourseNavigation(
  courseRoute: Coordinate[] | null,
  currentLocation: Coordinate | null,
  currentBearing: number,
): CourseNavigation | null {
  const lastIndexRef = useRef(0);

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

    // Find nearest point on course (windowed search around last known index)
    const lastIdx = lastIndexRef.current;
    const searchStart = Math.max(0, lastIdx - SEARCH_WINDOW);
    const searchEnd = Math.min(courseRoute.length - 1, lastIdx + SEARCH_WINDOW);

    let nearestIdx = lastIdx;
    let nearestDist = Infinity;

    // Also search full route if last index is 0 (initial search)
    const fullSearch = lastIdx === 0;
    const start = fullSearch ? 0 : searchStart;
    const end = fullSearch ? courseRoute.length - 1 : searchEnd;

    for (let i = start; i <= end; i++) {
      const dist = haversineDistance(currentLocation, courseRoute[i]);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIdx = i;
      }
    }

    lastIndexRef.current = nearestIdx;

    // Deviation
    const deviationMeters = nearestDist;
    const isOffCourse = deviationMeters > OFF_COURSE_THRESHOLD;

    // Remaining distance
    const remainingDistanceMeters = polylineDistance(courseRoute, nearestIdx, courseRoute.length - 1);

    // Total course distance (can be cached but useMemo handles it)
    const totalDistance = polylineDistance(courseRoute, 0, courseRoute.length - 1);
    const coveredDistance = totalDistance - remainingDistanceMeters;
    const progressPercent = totalDistance > 0 ? Math.min(100, Math.max(0, (coveredDistance / totalDistance) * 100)) : 0;

    // Bearing to next waypoint (look ahead by LOOK_AHEAD_POINTS)
    const lookAheadIdx = Math.min(nearestIdx + LOOK_AHEAD_POINTS, courseRoute.length - 1);
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

    return {
      nearestPointIndex: nearestIdx,
      deviationMeters,
      isOffCourse,
      bearingToNext,
      remainingDistanceMeters,
      progressPercent,
      nextDirection,
      turnPoints,
      currentTurnIndex,
      distanceToNextTurn,
      nextTurnDirection,
      instructionsRemaining,
    };
  }, [courseRoute, currentLocation, currentBearing, turnPoints, cumulativeDistances]);
}

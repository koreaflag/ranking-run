// ============================================================
// Turn-Point Pre-Analysis
// Extracts turn points from a route polyline using a 3-pass
// algorithm: candidate detection, merge, and classification.
// ============================================================

import type { Coordinate } from './geo';
import { bearing, haversineDistance, polylineDistance } from './geo';

export type TurnDirection =
  | 'straight'
  | 'slight-left'
  | 'left'
  | 'sharp-left'
  | 'slight-right'
  | 'right'
  | 'sharp-right'
  | 'u-turn';

export interface TurnPoint {
  index: number;
  coordinate: Coordinate;
  direction: TurnDirection;
  bearingDelta: number;
  distanceFromStart: number;
  distanceToNextTurn: number; // -1 for last
}

/** Merge threshold: candidates within this distance keep only the sharpest turn */
const MERGE_DISTANCE_M = 20;

/** Minimum absolute bearing delta to qualify as a turn candidate */
const MIN_TURN_ANGLE = 30;

// ---- Helpers ----

/**
 * Normalize an angle difference to the range [-180, 180].
 */
function normalizeDelta(delta: number): number {
  let d = delta % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/**
 * Classify a bearing delta into a TurnDirection.
 * Negative deltas correspond to left turns, positive to right turns.
 */
function classifyTurnDirection(delta: number): TurnDirection {
  const abs = Math.abs(delta);
  if (abs < MIN_TURN_ANGLE) return 'straight';
  if (abs >= 150) return 'u-turn';

  const isLeft = delta < 0;
  if (abs < 60) return isLeft ? 'slight-left' : 'slight-right';
  if (abs < 120) return isLeft ? 'left' : 'right';
  return isLeft ? 'sharp-left' : 'sharp-right';
}

// ---- Public API ----

/**
 * Compute cumulative distances along a route.
 * Returns an array where arr[i] = haversine distance from route[0] to route[i].
 */
export function computeCumulativeDistances(route: Coordinate[]): number[] {
  if (route.length === 0) return [];

  const distances: number[] = [0];
  for (let i = 1; i < route.length; i++) {
    distances.push(distances[i - 1] + haversineDistance(route[i - 1], route[i]));
  }
  return distances;
}

/**
 * Extract turn points from a route using a 3-pass algorithm.
 *
 * Pass 1: Detect candidates where |bearingDelta| >= 30 degrees.
 *         Always include route start and end as anchors.
 * Pass 2: Merge nearby candidates within 20m — keep the sharpest.
 * Pass 3: Classify direction and compute distances.
 */
export function extractTurnPoints(route: Coordinate[]): TurnPoint[] {
  if (route.length < 2) return [];

  const cumulativeDistances = computeCumulativeDistances(route);

  // ---- Pass 1: Detect candidates ----
  interface Candidate {
    index: number;
    bearingDelta: number;
  }

  const candidates: Candidate[] = [];

  // Start anchor
  candidates.push({ index: 0, bearingDelta: 0 });

  // Interior points
  for (let i = 1; i < route.length - 1; i++) {
    const bearingIn = bearing(route[i - 1], route[i]);
    const bearingOut = bearing(route[i], route[i + 1]);
    const delta = normalizeDelta(bearingOut - bearingIn);

    if (Math.abs(delta) >= MIN_TURN_ANGLE) {
      candidates.push({ index: i, bearingDelta: delta });
    }
  }

  // End anchor
  candidates.push({ index: route.length - 1, bearingDelta: 0 });

  // ---- Pass 2: Merge nearby candidates ----
  const merged: Candidate[] = [];
  let i = 0;

  while (i < candidates.length) {
    let best = candidates[i];
    let j = i + 1;

    // Collect all candidates within MERGE_DISTANCE_M of the current one
    while (j < candidates.length) {
      const dist = Math.abs(
        cumulativeDistances[candidates[j].index] - cumulativeDistances[best.index],
      );
      if (dist > MERGE_DISTANCE_M) break;

      // Keep the candidate with the larger |bearingDelta|
      if (Math.abs(candidates[j].bearingDelta) > Math.abs(best.bearingDelta)) {
        best = candidates[j];
      }
      j++;
    }

    merged.push(best);
    i = j;
  }

  // ---- Pass 3: Classify and compute distances ----
  const turnPoints: TurnPoint[] = merged.map((candidate, idx) => ({
    index: candidate.index,
    coordinate: route[candidate.index],
    direction: classifyTurnDirection(candidate.bearingDelta),
    bearingDelta: candidate.bearingDelta,
    distanceFromStart: cumulativeDistances[candidate.index],
    distanceToNextTurn:
      idx < merged.length - 1
        ? cumulativeDistances[merged[idx + 1].index] - cumulativeDistances[candidate.index]
        : -1,
  }));

  return turnPoints;
}

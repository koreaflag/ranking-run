// ============================================================
// Geo Utilities
// Haversine distance, bearing, and polyline distance calculations.
// Mirrors logic from ios/RunCrew/GPS/Util/GeoMath.swift
// ============================================================

const EARTH_RADIUS = 6371000; // meters

export interface Coordinate {
  latitude: number;
  longitude: number;
}

function toRadians(deg: number): number {
  return deg * (Math.PI / 180);
}

function toDegrees(rad: number): number {
  return rad * (180 / Math.PI);
}

/** Haversine distance between two coordinates in meters */
export function haversineDistance(a: Coordinate, b: Coordinate): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const aVal = sinDLat * sinDLat +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) *
    sinDLon * sinDLon;
  const c = 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));
  return EARTH_RADIUS * c;
}

/** Bearing from point a to point b in degrees (0-360) */
export function bearing(from: Coordinate, to: Coordinate): number {
  const dLon = toRadians(to.longitude - from.longitude);
  const y = Math.sin(dLon) * Math.cos(toRadians(to.latitude));
  const x = Math.cos(toRadians(from.latitude)) * Math.sin(toRadians(to.latitude)) -
    Math.sin(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude)) * Math.cos(dLon);
  const brng = toDegrees(Math.atan2(y, x));
  return (brng + 360) % 360;
}

/** Sum of haversine distances between consecutive points in a polyline segment */
export function polylineDistance(points: Coordinate[], startIdx: number, endIdx: number): number {
  let total = 0;
  for (let i = startIdx; i < endIdx && i < points.length - 1; i++) {
    total += haversineDistance(points[i], points[i + 1]);
  }
  return total;
}

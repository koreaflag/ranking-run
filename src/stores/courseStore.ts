/**
 * Backward-compatible barrel export.
 *
 * The monolithic courseStore has been split into two focused stores:
 *   - useCourseListStore  (list, filters, map, favorites, my courses)
 *   - useCourseDetailStore (detail, rankings, reviews, likes)
 *
 * This file provides a `useCourseStore` hook that merges both stores so that
 * existing consumer code continues to work without changes.
 *
 * NEW code should import directly from the split stores:
 *   import { useCourseListStore } from './courseListStore';
 *   import { useCourseDetailStore } from './courseDetailStore';
 */

import { useCourseListStore } from './courseListStore';
import { useCourseDetailStore } from './courseDetailStore';

// Re-export split stores for direct usage
export { useCourseListStore } from './courseListStore';
export { useCourseDetailStore } from './courseDetailStore';

/**
 * Unified selector hook for backward compatibility.
 *
 * Usage (same as before):
 *   const { courses, selectedCourse, fetchCourses } = useCourseStore();
 *   const courses = useCourseStore((s) => s.courses);
 *
 * Both hook-style and selector-style usage are supported. When called with a
 * selector, the selector receives the merged state from both stores.
 */
type MergedState = ReturnType<typeof useCourseListStore.getState> &
  ReturnType<typeof useCourseDetailStore.getState>;

export function useCourseStore(): MergedState;
export function useCourseStore<T>(selector: (state: MergedState) => T): T;
export function useCourseStore<T>(selector?: (state: MergedState) => T): T | MergedState {
  const listState = useCourseListStore();
  const detailState = useCourseDetailStore();

  const merged: MergedState = { ...listState, ...detailState };

  if (selector) {
    return selector(merged);
  }
  return merged;
}

/**
 * Static getState() / setState() for imperative access outside React components.
 * e.g. useCourseStore.getState().setPendingFocusCourseId(null)
 */
useCourseStore.getState = (): MergedState => ({
  ...useCourseListStore.getState(),
  ...useCourseDetailStore.getState(),
});

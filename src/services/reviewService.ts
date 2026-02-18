import api from './api';
import type {
  CourseReview,
  CourseReviewListResponse,
  ReviewCreateRequest,
  ReviewUpdateRequest,
} from '../types/api';

export const reviewService = {
  /**
   * Fetch paginated reviews for a specific course.
   */
  async getCourseReviews(
    courseId: string,
    page: number = 0,
    perPage: number = 20,
  ): Promise<CourseReviewListResponse> {
    return api.get<CourseReviewListResponse>(
      `/courses/${courseId}/reviews?page=${page}&per_page=${perPage}`,
    );
  },

  /**
   * Fetch the current user's review for a specific course.
   * Returns null if the user has not reviewed this course.
   */
  async getMyReview(courseId: string): Promise<CourseReview | null> {
    return api.get<CourseReview | null>(`/courses/${courseId}/reviews/mine`);
  },

  /**
   * Create a new review for a course.
   */
  async createReview(
    courseId: string,
    data: ReviewCreateRequest,
  ): Promise<CourseReview> {
    return api.post<CourseReview>(`/courses/${courseId}/reviews`, data);
  },

  /**
   * Update an existing review.
   */
  async updateReview(
    reviewId: string,
    data: ReviewUpdateRequest,
  ): Promise<CourseReview> {
    return api.patch<CourseReview>(`/courses/reviews/${reviewId}`, data);
  },

  /**
   * Delete a review.
   */
  async deleteReview(reviewId: string): Promise<void> {
    await api.delete(`/courses/reviews/${reviewId}`);
  },
};

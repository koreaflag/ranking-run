import api from './api';
import type { RankingEntry, RankingListResponse, MyRanking } from '../types/api';

export const rankingService = {
  /**
   * Fetch top rankings for a specific course (preview, e.g., top 10).
   */
  async getCourseRankings(
    courseId: string,
    limit: number = 10,
  ): Promise<RankingEntry[]> {
    return api.get<RankingEntry[]>(
      `/courses/${courseId}/rankings?limit=${limit}`,
    );
  },

  /**
   * Fetch paginated full ranking list for a course.
   */
  async getCourseRankingsFull(
    courseId: string,
    page: number = 0,
    perPage: number = 20,
  ): Promise<RankingListResponse> {
    return api.get<RankingListResponse>(
      `/courses/${courseId}/rankings?page=${page}&per_page=${perPage}`,
    );
  },

  /**
   * Fetch the current user's ranking on a specific course.
   */
  async getMyRanking(courseId: string): Promise<MyRanking> {
    return api.get<MyRanking>(`/courses/${courseId}/my-ranking`);
  },
};

import api from './api';
import type { RankingEntry, RankingListResponse, MyRanking, WeeklyLeaderboardResponse } from '../types/api';

export const rankingService = {
  /**
   * Fetch top rankings for a specific course (preview, e.g., top 10).
   */
  async getCourseRankings(
    courseId: string,
    limit: number = 10,
  ): Promise<RankingEntry[]> {
    const res = await api.get<RankingListResponse>(
      `/courses/${courseId}/rankings?limit=${limit}`,
    );
    return res.data;
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

  /**
   * Fetch weekly leaderboard (top runners this week).
   */
  async getWeeklyLeaderboard(params?: {
    region?: string;
    limit?: number;
  }): Promise<WeeklyLeaderboardResponse> {
    const searchParams = new URLSearchParams();
    if (params?.region) searchParams.set('region', params.region);
    if (params?.limit) searchParams.set('per_page', String(params.limit));
    const qs = searchParams.toString();
    return api.get<WeeklyLeaderboardResponse>(`/leaderboard/weekly${qs ? `?${qs}` : ''}`);
  },
};

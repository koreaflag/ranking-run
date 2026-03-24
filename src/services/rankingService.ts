import api from './api';
import type {
  RankingEntry,
  RankingFilterParams,
  RankingListResponse,
  MyRanking,
  WeeklyLeaderboardResponse,
} from '../types/api';

function buildFilterParams(filters?: RankingFilterParams): URLSearchParams {
  const params = new URLSearchParams();
  if (!filters) return params;
  if (filters.scope) params.set('scope', filters.scope);
  if (filters.gender) params.set('gender', filters.gender);
  if (filters.age_group) params.set('age_group', filters.age_group);
  if (filters.crew_id) params.set('crew_id', filters.crew_id);
  if (filters.country) params.set('country', filters.country);
  return params;
}

export const rankingService = {
  /**
   * Fetch top rankings for a specific course (preview, e.g., top 10).
   */
  async getCourseRankings(
    courseId: string,
    limit: number = 10,
    filters?: RankingFilterParams,
  ): Promise<RankingEntry[]> {
    const params = buildFilterParams(filters);
    params.set('limit', String(limit));
    const res = await api.get<RankingListResponse>(
      `/courses/${courseId}/rankings?${params.toString()}`,
    );
    return res.data;
  },

  /**
   * Fetch paginated full ranking list for a course with filters.
   */
  async getCourseRankingsFull(
    courseId: string,
    page: number = 0,
    perPage: number = 20,
    filters?: RankingFilterParams,
  ): Promise<RankingListResponse> {
    const params = buildFilterParams(filters);
    params.set('page', String(page));
    params.set('per_page', String(perPage));
    return api.get<RankingListResponse>(
      `/courses/${courseId}/rankings?${params.toString()}`,
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
    country?: string;
    limit?: number;
  }): Promise<WeeklyLeaderboardResponse> {
    const searchParams = new URLSearchParams();
    if (params?.region) searchParams.set('region', params.region);
    if (params?.country) searchParams.set('country', params.country);
    if (params?.limit) searchParams.set('per_page', String(params.limit));
    const qs = searchParams.toString();
    return api.get<WeeklyLeaderboardResponse>(`/leaderboard/weekly${qs ? `?${qs}` : ''}`);
  },
};

import api from './api';
import type {
  UserStats,
  StatsPeriod,
  WeeklySummary,
  RecentRun,
  RunHistoryResponse,
  RunRecordDetail,
  PublicProfile,
  SocialCounts,
  ActivityFeedItem,
  ActivityFeedResponse,
} from '../types/api';

export const userService = {
  /**
   * Fetch user statistics for a given period.
   */
  async getStats(period: StatsPeriod = 'month'): Promise<UserStats> {
    return api.get<UserStats>(`/users/me/stats?period=${period}`);
  },

  /**
   * Fetch weekly summary for the home screen.
   */
  async getWeeklySummary(): Promise<WeeklySummary> {
    return api.get<WeeklySummary>('/users/me/stats/weekly');
  },

  /**
   * Fetch recent run records (for the home screen).
   */
  async getRecentRuns(limit: number = 3): Promise<RecentRun[]> {
    const data = await api.get<RecentRun[] | RunHistoryResponse>(
      `/users/me/runs?limit=${limit}&order_by=finished_at&order=desc`,
    );
    // The API returns paginated data, but for recent runs we just need the array
    return Array.isArray(data)
      ? data
      : (data as RunHistoryResponse).data;
  },

  /**
   * Fetch paginated run history for MyPage.
   */
  async getRunHistory(
    page: number = 0,
    perPage: number = 20,
  ): Promise<RunHistoryResponse> {
    return api.get<RunHistoryResponse>(
      `/users/me/runs?page=${page}&per_page=${perPage}&order_by=finished_at&order=desc`,
    );
  },

  /**
   * Fetch detailed information for a specific run record.
   */
  async getRunDetail(runId: string): Promise<RunRecordDetail> {
    return api.get<RunRecordDetail>(`/runs/${runId}`);
  },

  /**
   * Fetch a public user profile by user ID.
   */
  async getPublicProfile(userId: string): Promise<PublicProfile> {
    return api.get<PublicProfile>(`/users/${userId}/profile`);
  },

  /**
   * Follow a user.
   */
  async followUser(userId: string): Promise<void> {
    await api.post(`/users/${userId}/follow`);
  },

  /**
   * Unfollow a user.
   */
  async unfollowUser(userId: string): Promise<void> {
    await api.delete(`/users/${userId}/follow`);
  },

  /**
   * Fetch social counts (followers, following, total likes) for the current user.
   */
  async getSocialCounts(): Promise<SocialCounts> {
    return api.get<SocialCounts>('/users/me/social-counts');
  },

  /**
   * Fetch activity feed from followed users.
   */
  async getActivityFeed(limit: number = 20): Promise<ActivityFeedItem[]> {
    const resp = await api.get<ActivityFeedResponse>(`/follows/activity-feed?limit=${limit}`);
    return resp.data;
  },
};

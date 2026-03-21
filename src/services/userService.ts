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
  FriendRunning,
  AnalyticsData,
  UserSearchByCodeResult,
  UserSearchResponse,
  FollowListResponse,
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
   * Search for a user by their unique code.
   */
  async searchByCode(code: string): Promise<UserSearchByCodeResult | null> {
    try {
      return await api.get<UserSearchByCodeResult>(
        `/follows/search-by-code/${encodeURIComponent(code)}`,
      );
    } catch {
      return null;
    }
  },

  /**
   * Follow a user by their unique code.
   */
  async followByCode(userCode: string): Promise<void> {
    await api.post('/follows/by-code', { user_code: userCode });
  },

  /**
   * Fetch social counts (followers, following, total likes) for the current user.
   */
  async getSocialCounts(): Promise<SocialCounts> {
    return api.get<SocialCounts>('/users/me/social-counts');
  },

  /**
   * Fetch analytics data (charts, heatmap, best efforts, weekly goal).
   */
  async getAnalytics(): Promise<AnalyticsData> {
    return api.get<AnalyticsData>('/users/me/analytics');
  },

  /**
   * Fetch activity feed from followed users.
   */
  async getActivityFeed(limit: number = 20): Promise<ActivityFeedItem[]> {
    const resp = await api.get<ActivityFeedResponse>(`/follows/activity-feed?limit=${limit}`);
    return resp.data;
  },

  /**
   * Fetch friends who are currently running.
   */
  async getFriendsRunning(): Promise<FriendRunning[]> {
    const resp = await api.get<{ data: FriendRunning[] }>('/follows/friends-running');
    return resp.data ?? [];
  },

  /**
   * Fetch a user's followers list (paginated).
   */
  async getFollowers(userId: string, page = 0, perPage = 20): Promise<FollowListResponse> {
    return api.get<FollowListResponse>(
      `/users/${userId}/followers?page=${page}&per_page=${perPage}`,
    );
  },

  /**
   * Fetch a user's following list (paginated).
   */
  async getFollowing(userId: string, page = 0, perPage = 20): Promise<FollowListResponse> {
    return api.get<FollowListResponse>(
      `/users/${userId}/following?page=${page}&per_page=${perPage}`,
    );
  },

  /**
   * Search users by nickname.
   */
  async searchUsers(params: {
    q: string;
    page?: number;
    per_page?: number;
  }): Promise<UserSearchResponse> {
    const sp = new URLSearchParams();
    sp.set('q', params.q);
    if (params.page !== undefined) sp.set('page', String(params.page));
    if (params.per_page !== undefined) sp.set('per_page', String(params.per_page));
    return api.get<UserSearchResponse>(`/users/search?${sp.toString()}`);
  },

  async dailyCheckin(): Promise<{ checked_in: boolean; points_earned: number; total_points: number; already: boolean }> {
    return api.post('/users/me/daily-checkin');
  },

  /**
   * Update the user's weekly running goal (km).
   */
  async updateWeeklyGoal(goalKm: number): Promise<{ weekly_goal_km: number }> {
    return api.patch<{ weekly_goal_km: number }>('/users/me/weekly-goal', { goal_km: goalKm });
  },

  async deleteAccount(): Promise<void> {
    await api.delete('/users/me/account');
  },
};

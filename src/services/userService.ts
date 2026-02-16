import api from './api';
import type {
  UserStats,
  StatsPeriod,
  WeeklySummary,
  RecentRun,
  RunHistoryResponse,
  RunRecordDetail,
} from '../types/api';

export const userService = {
  /**
   * Fetch user statistics for a given period.
   */
  async getStats(period: StatsPeriod = 'month'): Promise<UserStats> {
    const response = await api.get<UserStats>('/users/me/stats', {
      params: { period },
    });
    return response.data;
  },

  /**
   * Fetch weekly summary for the home screen.
   */
  async getWeeklySummary(): Promise<WeeklySummary> {
    const response = await api.get<WeeklySummary>('/users/me/stats/weekly');
    return response.data;
  },

  /**
   * Fetch recent run records (for the home screen).
   */
  async getRecentRuns(limit: number = 3): Promise<RecentRun[]> {
    const response = await api.get<RecentRun[]>('/users/me/runs', {
      params: {
        limit,
        order_by: 'finished_at',
        order: 'desc',
      },
    });
    // The API returns paginated data, but for recent runs we just need the array
    return Array.isArray(response.data)
      ? response.data
      : (response.data as unknown as RunHistoryResponse).data;
  },

  /**
   * Fetch paginated run history for MyPage.
   */
  async getRunHistory(
    page: number = 0,
    perPage: number = 20,
  ): Promise<RunHistoryResponse> {
    const response = await api.get<RunHistoryResponse>('/users/me/runs', {
      params: {
        page,
        per_page: perPage,
        order_by: 'finished_at',
        order: 'desc',
      },
    });
    return response.data;
  },

  /**
   * Fetch detailed information for a specific run record.
   */
  async getRunDetail(runId: string): Promise<RunRecordDetail> {
    const response = await api.get<RunRecordDetail>(`/runs/${runId}`);
    return response.data;
  },
};

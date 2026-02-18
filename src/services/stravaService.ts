import api from './api';
import type {
  StravaAuthURLResponse,
  StravaConnectionStatus,
  StravaActivity,
  StravaSyncResponse,
} from '../types/api';

export const stravaService = {
  async getAuthURL(): Promise<StravaAuthURLResponse> {
    return api.get<StravaAuthURLResponse>('/strava/auth-url');
  },

  async handleCallback(
    code: string,
    state: string,
  ): Promise<StravaConnectionStatus> {
    return api.post<StravaConnectionStatus>('/strava/callback', {
      code,
      state,
    });
  },

  async getStatus(): Promise<StravaConnectionStatus> {
    return api.get<StravaConnectionStatus>('/strava/status');
  },

  async listActivities(
    perPage = 30,
    afterTs?: number,
  ): Promise<StravaActivity[]> {
    const params = new URLSearchParams({ per_page: String(perPage) });
    if (afterTs !== undefined) params.set('after_ts', String(afterTs));
    return api.get<StravaActivity[]>(`/strava/activities?${params.toString()}`);
  },

  async syncActivity(stravaActivityId: number): Promise<StravaSyncResponse> {
    return api.post<StravaSyncResponse>('/strava/sync', {
      strava_activity_id: stravaActivityId,
    });
  },

  async disconnect(): Promise<void> {
    return api.delete('/strava/disconnect');
  },
};

import * as SecureStore from 'expo-secure-store';
import api from './api';
import { API_BASE_URL, SECURE_STORE_KEYS } from '../utils/constants';

// ---- Types ----

export interface LiveGroupRunParticipant {
  user_id: string;
  nickname: string;
  avatar_url: string | null;
  status: 'waiting' | 'running' | 'completed';
  current_distance_m: number;
  current_duration_s: number;
  last_lat: number | null;
  last_lng: number | null;
}

export interface LiveGroupRunListItem {
  id: string;
  title: string;
  status: 'waiting' | 'running' | 'completed';
  course_name: string;
  host_nickname: string;
  host_avatar_url: string | null;
  participant_count: number;
  max_participants: number;
  scheduled_at: string | null;
  created_at: string;
}

export interface LiveGroupRunDetail {
  id: string;
  title: string;
  status: 'waiting' | 'running' | 'completed';
  course_id: string;
  course_name: string;
  host_user_id: string;
  host_nickname: string;
  host_avatar_url: string | null;
  max_participants: number;
  scheduled_at: string | null;
  participants: LiveGroupRunParticipant[];
}

export interface LiveGroupRunListResponse {
  items: LiveGroupRunListItem[];
}

export interface LiveGroupRunCreateRequest {
  course_id: string;
  title: string;
  max_participants?: number;
  scheduled_at?: string;
}

export interface LiveGroupRunCreateResponse {
  id: string;
  course_id: string;
  host_user_id: string;
  title: string;
  status: string;
  max_participants: number;
}

// ---- Service ----

export const liveGroupRunService = {
  async list(): Promise<LiveGroupRunListResponse> {
    return api.get<LiveGroupRunListResponse>('/live-group-runs');
  },

  async getDetail(id: string): Promise<LiveGroupRunDetail> {
    return api.get<LiveGroupRunDetail>(`/live-group-runs/${id}`);
  },

  async create(req: LiveGroupRunCreateRequest): Promise<LiveGroupRunCreateResponse> {
    return api.post<LiveGroupRunCreateResponse>('/live-group-runs', req);
  },

  async join(id: string): Promise<void> {
    return api.post(`/live-group-runs/${id}/join`);
  },

  async start(id: string): Promise<void> {
    return api.post(`/live-group-runs/${id}/start`);
  },

  /**
   * Build a WebSocket URL for a live group run lobby.
   * Replaces http(s) with ws(s) from API_BASE_URL.
   */
  async buildWsUrl(id: string): Promise<string> {
    const token = await SecureStore.getItemAsync(SECURE_STORE_KEYS.ACCESS_TOKEN);
    const wsBase = API_BASE_URL.replace(/^http/, 'ws');
    return `${wsBase}/live-group-runs/${id}/ws?token=${token ?? ''}`;
  },
};

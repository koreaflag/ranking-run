import api from './api';
import type {
  CrewItem,
  CrewListResponse,
  CrewMemberItem,
  CrewMemberListResponse,
  CrewCreateRequest,
  CrewJoinRequestItem,
  CrewJoinRequestListResponse,
  MyJoinRequestStatus,
} from '../types/api';

class CrewService {
  async createCrew(data: CrewCreateRequest): Promise<CrewItem> {
    return api.post<CrewItem>('/crews', data);
  }

  async listCrews(params?: {
    search?: string;
    region?: string;
    page?: number;
    per_page?: number;
  }): Promise<CrewListResponse> {
    const sp = new URLSearchParams();
    if (params?.search) sp.set('search', params.search);
    if (params?.region) sp.set('region', params.region);
    if (params?.page !== undefined) sp.set('page', String(params.page));
    if (params?.per_page !== undefined) sp.set('per_page', String(params.per_page));
    const q = sp.toString();
    return api.get<CrewListResponse>(`/crews${q ? `?${q}` : ''}`);
  }

  async getMyCrews(): Promise<CrewItem[]> {
    return api.get<CrewItem[]>('/crews/my');
  }

  async getCrew(crewId: string): Promise<CrewItem> {
    return api.get<CrewItem>(`/crews/${crewId}`);
  }

  async updateCrew(crewId: string, data: Partial<CrewCreateRequest>): Promise<CrewItem> {
    return api.patch<CrewItem>(`/crews/${crewId}`, data);
  }

  async deleteCrew(crewId: string): Promise<void> {
    return api.delete(`/crews/${crewId}`);
  }

  async joinCrew(crewId: string): Promise<CrewItem> {
    return api.post<CrewItem>(`/crews/${crewId}/join`);
  }

  async leaveCrew(crewId: string): Promise<void> {
    return api.post(`/crews/${crewId}/leave`);
  }

  async getMembers(crewId: string, params?: {
    page?: number;
    per_page?: number;
  }): Promise<CrewMemberListResponse> {
    const sp = new URLSearchParams();
    if (params?.page !== undefined) sp.set('page', String(params.page));
    if (params?.per_page !== undefined) sp.set('per_page', String(params.per_page));
    const q = sp.toString();
    return api.get<CrewMemberListResponse>(`/crews/${crewId}/members${q ? `?${q}` : ''}`);
  }

  async updateMemberRole(crewId: string, userId: string, role: 'admin' | 'member'): Promise<CrewMemberItem> {
    return api.patch<CrewMemberItem>(`/crews/${crewId}/members/${userId}/role`, { role });
  }

  async kickMember(crewId: string, userId: string): Promise<void> {
    return api.delete(`/crews/${crewId}/members/${userId}`);
  }

  async inviteByCode(crewId: string, userCode: string): Promise<CrewMemberItem> {
    return api.post<CrewMemberItem>(`/crews/${crewId}/invite`, { user_code: userCode });
  }

  async setPrimaryCrew(crewId: string): Promise<{ crew_name: string }> {
    return api.put<{ crew_name: string }>('/crews/my/primary', { crew_id: crewId });
  }

  // ---- Join Requests ----

  async requestJoin(crewId: string, message?: string): Promise<CrewJoinRequestItem> {
    return api.post<CrewJoinRequestItem>(`/crews/${crewId}/join-requests`, { message: message || null });
  }

  async getMyJoinRequest(crewId: string): Promise<MyJoinRequestStatus> {
    return api.get<MyJoinRequestStatus>(`/crews/${crewId}/join-requests/my`);
  }

  async getPendingRequests(crewId: string, params?: {
    page?: number;
    per_page?: number;
  }): Promise<CrewJoinRequestListResponse> {
    const sp = new URLSearchParams();
    if (params?.page !== undefined) sp.set('page', String(params.page));
    if (params?.per_page !== undefined) sp.set('per_page', String(params.per_page));
    const q = sp.toString();
    return api.get<CrewJoinRequestListResponse>(`/crews/${crewId}/join-requests${q ? `?${q}` : ''}`);
  }

  async approveRequest(crewId: string, requestId: string): Promise<CrewJoinRequestItem> {
    return api.patch<CrewJoinRequestItem>(`/crews/${crewId}/join-requests/${requestId}/approve`);
  }

  async rejectRequest(crewId: string, requestId: string): Promise<void> {
    return api.patch(`/crews/${crewId}/join-requests/${requestId}/reject`);
  }

  async cancelRequest(crewId: string, requestId: string): Promise<void> {
    return api.delete(`/crews/${crewId}/join-requests/${requestId}`);
  }

  async getPendingRequestCount(crewId: string): Promise<number> {
    const res = await api.get<{ count: number }>(`/crews/${crewId}/join-requests/count`);
    return res.count;
  }

  async uploadImage(fileUri: string): Promise<string> {
    const formData = new FormData();
    const filename = fileUri.split('/').pop() ?? 'photo.jpg';
    const match = /\.(\w+)$/.exec(filename);
    const type = match ? `image/${match[1]}` : 'image/jpeg';

    formData.append('file', {
      uri: fileUri,
      name: filename,
      type,
    } as unknown as Blob);

    const res = await api.post<{ url: string }>('/uploads/image', formData);
    return res.url;
  }
}

export const crewService = new CrewService();

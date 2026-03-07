import api from './api';
import type {
  GroupRunItem,
  GroupRunListResponse,
  GroupRankingListResponse,
} from '../types/api';

export const groupRunService = {
  async createGroupRun(
    name: string,
    courseId: string,
    inviteUserIds: string[],
  ): Promise<GroupRunItem> {
    return api.post<GroupRunItem>('/group-runs', {
      name,
      course_id: courseId,
      invite_user_ids: inviteUserIds,
    });
  },

  async getMyGroupRuns(courseId?: string): Promise<GroupRunListResponse> {
    const params = courseId ? `?course_id=${courseId}` : '';
    return api.get<GroupRunListResponse>(`/group-runs/my${params}`);
  },

  async getGroupRun(groupRunId: string): Promise<GroupRunItem> {
    return api.get<GroupRunItem>(`/group-runs/${groupRunId}`);
  },

  async acceptInvite(groupRunId: string): Promise<GroupRunItem> {
    return api.post<GroupRunItem>(`/group-runs/${groupRunId}/accept`);
  },

  async declineInvite(groupRunId: string): Promise<void> {
    return api.post(`/group-runs/${groupRunId}/decline`);
  },

  async inviteMembers(
    groupRunId: string,
    userIds: string[],
  ): Promise<GroupRunItem> {
    return api.post<GroupRunItem>(`/group-runs/${groupRunId}/invite`, {
      user_ids: userIds,
    });
  },

  async leaveGroup(groupRunId: string): Promise<void> {
    return api.post(`/group-runs/${groupRunId}/leave`);
  },

  async disbandGroup(groupRunId: string): Promise<void> {
    return api.delete(`/group-runs/${groupRunId}`);
  },

  async getCourseGroupRankings(
    courseId: string,
    page: number = 0,
    perPage: number = 10,
  ): Promise<GroupRankingListResponse> {
    return api.get<GroupRankingListResponse>(
      `/courses/${courseId}/group-rankings?page=${page}&per_page=${perPage}`,
    );
  },
};

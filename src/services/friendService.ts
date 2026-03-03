import api from './api';
import type {
  FriendRequestItem,
  FriendRequestListResponse,
  FriendListResponse,
  FriendshipStatusResponse,
} from '../types/api';

export const friendService = {
  /** Send a friend request to a user. */
  async sendRequest(userId: string): Promise<FriendRequestItem> {
    return api.post<FriendRequestItem>(`/friend-requests/${userId}`);
  },

  /** Accept a pending friend request. */
  async acceptRequest(requestId: string): Promise<FriendRequestItem> {
    return api.patch<FriendRequestItem>(`/friend-requests/${requestId}/accept`);
  },

  /** Decline a pending friend request. */
  async declineRequest(requestId: string): Promise<void> {
    await api.patch(`/friend-requests/${requestId}/decline`);
  },

  /** Cancel a friend request you sent. */
  async cancelRequest(requestId: string): Promise<void> {
    await api.delete(`/friend-requests/${requestId}`);
  },

  /** Remove a friend (unfriend). */
  async removeFriend(userId: string): Promise<void> {
    await api.delete(`/friends/${userId}`);
  },

  /** Get received pending friend requests. */
  async getReceivedRequests(page = 0, perPage = 20): Promise<FriendRequestListResponse> {
    return api.get<FriendRequestListResponse>(
      `/friend-requests/received?page=${page}&per_page=${perPage}`,
    );
  },

  /** Get sent pending friend requests. */
  async getSentRequests(page = 0, perPage = 20): Promise<FriendRequestListResponse> {
    return api.get<FriendRequestListResponse>(
      `/friend-requests/sent?page=${page}&per_page=${perPage}`,
    );
  },

  /** Get confirmed friends list. */
  async getFriends(page = 0, perPage = 20): Promise<FriendListResponse> {
    return api.get<FriendListResponse>(
      `/friends?page=${page}&per_page=${perPage}`,
    );
  },

  /** Get friendship status with a specific user. */
  async getFriendshipStatus(userId: string): Promise<FriendshipStatusResponse> {
    return api.get<FriendshipStatusResponse>(
      `/users/${userId}/friendship-status`,
    );
  },

  /** Get count of pending friend requests (for badge). */
  async getPendingCount(): Promise<number> {
    const res = await api.get<{ count: number }>('/friend-requests/pending-count');
    return res.count;
  },
};

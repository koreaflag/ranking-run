import api from './api';
import type { NotificationListResponse } from '../types/api';

class NotificationService {
  async getNotifications(params?: {
    page?: number;
    per_page?: number;
  }): Promise<NotificationListResponse> {
    const searchParams = new URLSearchParams();
    if (params?.page !== undefined) searchParams.set('page', String(params.page));
    if (params?.per_page !== undefined) searchParams.set('per_page', String(params.per_page));
    const qs = searchParams.toString();
    return api.get<NotificationListResponse>(
      `/notifications${qs ? `?${qs}` : ''}`,
    );
  }

  async getUnreadCount(): Promise<{ count: number }> {
    return api.get<{ count: number }>('/notifications/unread-count');
  }

  async markAsRead(id: string): Promise<void> {
    await api.post(`/notifications/${id}/read`);
  }

  async markAllAsRead(): Promise<void> {
    await api.post('/notifications/read-all');
  }

  async registerToken(deviceToken: string, platform: string): Promise<void> {
    await api.post('/notifications/token', { device_token: deviceToken, platform });
  }

  async unregisterToken(deviceToken: string): Promise<void> {
    await api.delete('/notifications/token', {
      body: JSON.stringify({ device_token: deviceToken }),
    });
  }
}

export const notificationService = new NotificationService();

import api from './api';
import type { AnnouncementListResponse } from '../types/api';

class AnnouncementService {
  async getAnnouncements(limit = 10): Promise<AnnouncementListResponse> {
    return api.get<AnnouncementListResponse>(`/announcements?limit=${limit}`);
  }
}

export const announcementService = new AnnouncementService();

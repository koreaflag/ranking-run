import api from './api';
import type { EventItem, EventListResponse, EventParticipantInfo, EventType } from '../types/api';

class EventService {
  async getEvents(params?: {
    event_type?: EventType;
    page?: number;
    per_page?: number;
  }): Promise<EventListResponse> {
    const searchParams = new URLSearchParams();
    if (params?.event_type) searchParams.set('event_type', params.event_type);
    if (params?.page !== undefined) searchParams.set('page', String(params.page));
    if (params?.per_page !== undefined) searchParams.set('per_page', String(params.per_page));

    const query = searchParams.toString();
    return api.get<EventListResponse>(`/events${query ? `?${query}` : ''}`);
  }

  async getEvent(eventId: string): Promise<EventItem> {
    return api.get<EventItem>(`/events/${eventId}`);
  }

  async joinEvent(eventId: string): Promise<EventParticipantInfo> {
    return api.post<EventParticipantInfo>(`/events/${eventId}/join`);
  }

  async leaveEvent(eventId: string): Promise<void> {
    return api.delete(`/events/${eventId}/join`);
  }
}

export const eventService = new EventService();

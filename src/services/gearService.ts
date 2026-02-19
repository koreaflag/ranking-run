import api from './api';
import type { GearItem, GearCreateRequest, GearUpdateRequest } from '../types/api';

export const gearService = {
  /**
   * Fetch available gear brand list.
   */
  getBrands: () => api.get<{ brands: string[] }>('/gear/brands'),

  /**
   * Fetch all gear items for the current user.
   */
  getMyGear: () => api.get<GearItem[]>('/gear'),

  /**
   * Create a new gear item.
   */
  createGear: (data: GearCreateRequest) => api.post<GearItem>('/gear', data),

  /**
   * Update an existing gear item.
   */
  updateGear: (id: string, data: GearUpdateRequest) =>
    api.patch<GearItem>(`/gear/${id}`, data),

  /**
   * Delete a gear item.
   */
  deleteGear: (id: string) => api.delete(`/gear/${id}`),

  /**
   * Fetch gear items for a specific user (public profile).
   */
  getUserGear: (userId: string) => api.get<GearItem[]>(`/users/${userId}/gear`),
};

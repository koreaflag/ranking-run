import api from './api';
import type {
  ImportUploadResponse,
  ImportDetailResponse,
  ImportListResponse,
} from '../types/api';

export const importService = {
  async uploadFile(
    fileUri: string,
    filename: string,
  ): Promise<ImportUploadResponse> {
    const formData = new FormData();
    const isGpx = filename.toLowerCase().endsWith('.gpx');
    formData.append('file', {
      uri: fileUri,
      name: filename,
      type: isGpx ? 'application/gpx+xml' : 'application/octet-stream',
    } as unknown as Blob);
    return api.post<ImportUploadResponse>('/imports/upload', formData);
  },

  async getImportStatus(importId: string): Promise<ImportDetailResponse> {
    return api.get<ImportDetailResponse>(`/imports/${importId}`);
  },

  async listImports(page = 0, perPage = 20): Promise<ImportListResponse> {
    return api.get<ImportListResponse>(
      `/imports/?page=${page}&per_page=${perPage}`,
    );
  },

  async deleteImport(importId: string): Promise<void> {
    return api.delete(`/imports/${importId}`);
  },
};

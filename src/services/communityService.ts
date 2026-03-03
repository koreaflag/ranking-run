import api from './api';
import type {
  CommunityPostItem,
  CommunityPostListResponse,
  CommunityCommentItem,
  CommunityCommentListResponse,
  CommunityPostType,
} from '../types/api';

class CommunityService {
  /** Fetch a paginated list of community posts, optionally filtered by type. */
  async getPosts(params?: {
    page?: number;
    per_page?: number;
    post_type?: CommunityPostType;
    crew_id?: string;
  }): Promise<CommunityPostListResponse> {
    const searchParams = new URLSearchParams();
    if (params?.page !== undefined) searchParams.set('page', String(params.page));
    if (params?.per_page !== undefined) searchParams.set('per_page', String(params.per_page));
    if (params?.post_type) searchParams.set('post_type', params.post_type);
    if (params?.crew_id) searchParams.set('crew_id', params.crew_id);

    const qs = searchParams.toString();
    return api.get<CommunityPostListResponse>(
      `/community/posts${qs ? `?${qs}` : ''}`,
    );
  }

  /** Fetch a single community post by ID. */
  async getPost(postId: string): Promise<CommunityPostItem> {
    return api.get<CommunityPostItem>(`/community/posts/${postId}`);
  }

  /** Create a new community post. */
  async createPost(data: {
    title: string;
    content: string;
    post_type: CommunityPostType;
    event_id?: string;
    crew_id?: string;
    image_url?: string;
  }): Promise<CommunityPostItem> {
    return api.post<CommunityPostItem>('/community/posts', data);
  }

  /** Upload an image for a community post. Returns the public URL. */
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

  /** Update a community post (author only). */
  async updatePost(
    postId: string,
    data: { title?: string; content?: string; image_url?: string },
  ): Promise<CommunityPostItem> {
    return api.patch<CommunityPostItem>(`/community/posts/${postId}`, data);
  }

  /** Delete a community post (author or crew admin/owner). */
  async deletePost(postId: string): Promise<void> {
    await api.delete(`/community/posts/${postId}`);
  }

  /** Fetch paginated comments for a community post. */
  async getComments(
    postId: string,
    params?: { page?: number; per_page?: number },
  ): Promise<CommunityCommentListResponse> {
    const searchParams = new URLSearchParams();
    if (params?.page !== undefined) searchParams.set('page', String(params.page));
    if (params?.per_page !== undefined) searchParams.set('per_page', String(params.per_page));

    const qs = searchParams.toString();
    return api.get<CommunityCommentListResponse>(
      `/community/posts/${postId}/comments${qs ? `?${qs}` : ''}`,
    );
  }

  /** Add a comment to a community post. */
  async createComment(postId: string, content: string): Promise<CommunityCommentItem> {
    return api.post<CommunityCommentItem>(
      `/community/posts/${postId}/comments`,
      { content },
    );
  }

  /** Delete a comment owned by the current user. */
  async deleteComment(postId: string, commentId: string): Promise<void> {
    await api.delete(`/community/posts/${postId}/comments/${commentId}`);
  }

  /** Toggle like on a community post. Returns the new like state and count. */
  async toggleLike(postId: string): Promise<{ is_liked: boolean; like_count: number }> {
    return api.post<{ is_liked: boolean; like_count: number }>(
      `/community/posts/${postId}/like`,
    );
  }
}

export const communityService = new CommunityService();

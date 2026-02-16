import api from './api';
import type {
  CreateSessionRequest,
  CreateSessionResponse,
  UploadChunkRequest,
  UploadChunkResponse,
  CompleteRunRequest,
  RunCompleteResponse,
} from '../types/api';

export const runService = {
  /**
   * Create a new running session. Called when the user taps "Start Running".
   * If network is unavailable, the client should generate a local UUID
   * and register the session when connectivity returns.
   */
  async createSession(
    request: CreateSessionRequest,
  ): Promise<CreateSessionResponse> {
    const response = await api.post<CreateSessionResponse>(
      '/runs/sessions',
      request,
    );
    return response.data;
  },

  /**
   * Upload a GPS data chunk to the server.
   * Called every 1km or 5 minutes during a run, in the background.
   * This should never block the running experience.
   */
  async uploadChunk(
    sessionId: string,
    request: UploadChunkRequest,
  ): Promise<UploadChunkResponse> {
    const response = await api.post<UploadChunkResponse>(
      `/runs/sessions/${sessionId}/chunks`,
      request,
    );
    return response.data;
  },

  /**
   * Mark a running session as complete and submit the final summary.
   * This is a two-step process: the final chunk is uploaded first,
   * then this endpoint is called with the full session summary.
   */
  async completeRun(
    sessionId: string,
    request: CompleteRunRequest,
  ): Promise<RunCompleteResponse> {
    const response = await api.post<RunCompleteResponse>(
      `/runs/sessions/${sessionId}/complete`,
      request,
    );
    return response.data;
  },

  /**
   * Batch upload previously failed chunks.
   * Called when the app detects missing chunks after run completion
   * or on app restart.
   */
  async uploadChunksBatch(
    sessionId: string,
    chunks: UploadChunkRequest[],
  ): Promise<{
    received_sequences: number[];
    failed_sequences: number[];
  }> {
    const response = await api.post(
      `/runs/sessions/${sessionId}/chunks/batch`,
      { session_id: sessionId, chunks },
    );
    return response.data;
  },

  /**
   * Recover an incomplete session (e.g., after app crash).
   * The server reconstructs the run from whatever chunks it has received.
   */
  async recoverSession(
    sessionId: string,
    data: {
      finished_at: string;
      total_chunks: number;
      uploaded_chunk_sequences: number[];
    },
  ): Promise<{
    run_record_id: string;
    recovered_distance_meters: number;
    recovered_duration_seconds: number;
    missing_chunk_sequences: number[];
  }> {
    const response = await api.post(
      `/runs/sessions/${sessionId}/recover`,
      data,
    );
    return response.data;
  },

  /**
   * Discard an incomplete session and delete local chunk data.
   */
  async discardSession(sessionId: string): Promise<void> {
    await api.delete(`/runs/sessions/${sessionId}`);
  },
};

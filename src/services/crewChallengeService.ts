import api from './api';
import type {
  CrewChallengeItem,
  CrewChallengeHistoryResponse,
  CrewCourseRankingListResponse,
} from '../types/api';

export const crewChallengeService = {
  async createChallenge(
    crewId: string,
    courseId: string,
  ): Promise<CrewChallengeItem> {
    return api.post<CrewChallengeItem>(`/crews/${crewId}/challenges`, {
      course_id: courseId,
    });
  },

  async getActiveChallenge(
    crewId: string,
  ): Promise<CrewChallengeItem | null> {
    return api.get<CrewChallengeItem | null>(
      `/crews/${crewId}/challenges/active`,
    );
  },

  async endChallenge(
    crewId: string,
    challengeId: string,
  ): Promise<CrewChallengeItem> {
    return api.post<CrewChallengeItem>(
      `/crews/${crewId}/challenges/${challengeId}/end`,
    );
  },

  async getChallengeHistory(
    crewId: string,
    page: number = 0,
    perPage: number = 10,
  ): Promise<CrewChallengeHistoryResponse> {
    return api.get<CrewChallengeHistoryResponse>(
      `/crews/${crewId}/challenges/history?page=${page}&per_page=${perPage}`,
    );
  },

  async getCourseCrewRankings(
    courseId: string,
    page: number = 0,
    perPage: number = 20,
  ): Promise<CrewCourseRankingListResponse> {
    return api.get<CrewCourseRankingListResponse>(
      `/courses/${courseId}/crew-rankings?page=${page}&per_page=${perPage}`,
    );
  },
};

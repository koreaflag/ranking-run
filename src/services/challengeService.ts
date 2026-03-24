import api from './api';

// ---- Types ----

export type ChallengeType = 'individual' | 'crew';
export type GoalType = 'total_distance' | 'total_runs' | 'total_duration' | 'streak_days';

export interface ChallengeListItem {
  id: string;
  title: string;
  description: string;
  challenge_type: ChallengeType;
  goal_type: GoalType;
  goal_value: number;
  start_date: string;
  end_date: string;
  participant_count: number;
  reward_points: number;
  is_joined: boolean;
}

export interface ChallengeListResponse {
  items: ChallengeListItem[];
}

export interface ChallengeProgress {
  current_value: number;
  completed: boolean;
}

export interface ChallengeDetail {
  id: string;
  title: string;
  description: string;
  challenge_type: ChallengeType;
  goal_type: GoalType;
  goal_value: number;
  start_date: string;
  end_date: string;
  participant_count: number;
  reward_points: number;
  is_joined: boolean;
  my_progress: ChallengeProgress | null;
}

export const challengeService = {
  /**
   * Fetch active challenges list.
   */
  async getChallenges(): Promise<ChallengeListResponse> {
    return api.get<ChallengeListResponse>('/challenges');
  },

  /**
   * Fetch challenge detail by id.
   */
  async getChallengeDetail(challengeId: string): Promise<ChallengeDetail> {
    return api.get<ChallengeDetail>(`/challenges/${challengeId}`);
  },

  /**
   * Join a challenge.
   */
  async joinChallenge(challengeId: string): Promise<void> {
    await api.post(`/challenges/${challengeId}/join`);
  },
};

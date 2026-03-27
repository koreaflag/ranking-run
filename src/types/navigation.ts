// ============================================================
// React Navigation Type Definitions
// ============================================================

export type RootStackParamList = {
  Auth: undefined;
  Onboarding: undefined;
  Main: undefined;
};

export type AuthStackParamList = {
  Login: undefined;
  Consent: undefined;
  TermsDetail: undefined;
  PrivacyDetail: undefined;
  LocationDetail: undefined;
  Onboarding: undefined;
};

export type MainTabParamList = {
  WorldTab: { screen?: string; params?: Record<string, unknown> } | undefined;
  HomeTab: undefined;
  CourseTab: undefined;
  CommunityTab: undefined;
  MyPageTab: undefined;
};

export type WorldStackParamList = {
  World: undefined;
  CourseDetail: { courseId: string; selectForRaid?: string };
  CrewDetail: { crewId: string };
  UserProfile: { userId: string };
  RunningMain: { courseId?: string } | undefined;
  RunResult: { sessionId: string; alreadyCompleted?: boolean };
  HeartRateSettings: undefined;
  WatchSettings: undefined;
};

export type HomeStackParamList = {
  Home: undefined;
  ActivityFeed: undefined;
  NotificationInbox: undefined;
  CourseDetail: { courseId: string; selectForRaid?: string };
  RunHistory: undefined;
  RunDetail: { runId: string };
  UserProfile: { userId: string };
  CrewCreate: undefined;
  CrewDetail: { crewId: string };
  CrewMembers: { crewId: string };
  CrewSearch: undefined;
  CommunityFeed: undefined;
  CommunityPostDetail: { postId: string };
  CommunityPostCreate: { crewId?: string } | undefined;
  CrewBoard: { crewId: string; crewName: string };
  CrewEdit: { crewId: string };
  CrewManage: { crewId: string };
  CrewNotifications: { crewId: string };
  CommunityPostEdit: { postId: string; title?: string; content: string; imageUrl?: string; postType: string };
  World: undefined;
  CourseList: undefined;
  FollowList: { userId: string; type: 'followers' | 'following' };
  Friends: undefined;
  CrewMemberSettings: { crewId: string; crewName: string };
  CrewActiveCourses: { crewId: string; crewName: string };
  ChallengeList: undefined;
  ChallengeDetail: { challengeId: string };
  GroupRunList: undefined;
  GroupRunCreate: undefined;
  GroupRunLobby: { groupRunId: string };
};

export type CourseStackParamList = {
  CourseList: undefined;
  CourseSearch: { initialSort?: 'total_runs' | 'created_at' | 'distance_meters' } | undefined;
  CourseDetail: { courseId: string; openReview?: boolean; selectForRaid?: string };
  CourseRanking: { courseId: string };
  CrewDetail: { crewId: string };
  CourseCreate: {
    runRecordId: string;
    routePoints: Array<{ latitude: number; longitude: number }>;
    distanceMeters: number;
    durationSeconds: number;
    elevationGainMeters: number;
    isLoop?: boolean;
  };
  CourseRouteCorrect: { courseId: string };
  UserProfile: { userId: string };
};

export type RunningStackParamList = {
  RunningMain: { courseId?: string } | undefined;
  RunResult: { sessionId: string; alreadyCompleted?: boolean };
};

export type CommunityStackParamList = {
  CommunityFeed: undefined;
  CommunityPostDetail: { postId: string };
  CommunityPostCreate: { crewId?: string } | undefined;
  CourseDetail: { courseId: string; openReview?: boolean; selectForRaid?: string };
  CrewCreate: undefined;
  CrewDetail: { crewId: string };
  CrewMembers: { crewId: string };
  CrewSearch: undefined;
  UserProfile: { userId: string };
  FindFriends: undefined;
  CrewBoard: { crewId: string; crewName: string };
  CrewEdit: { crewId: string };
  CrewManage: { crewId: string };
  CrewNotifications: { crewId: string };
  CommunityPostEdit: { postId: string; title?: string; content: string; imageUrl?: string; postType: string };
  FollowList: { userId: string; type: 'followers' | 'following' };
  Friends: undefined;
  UnifiedSearch: undefined;
  CrewMemberSettings: { crewId: string; crewName: string };
};

export type MyPageStackParamList = {
  MyPage: undefined;
  RunHistory: undefined;
  RunDetail: { runId: string };
  MyCourses: undefined;
  CourseDetail: { courseId: string };
  Settings: undefined;
  PrivacyPolicy: undefined;
  TermsOfService: undefined;
  ProfileEdit: undefined;
  UserProfile: { userId: string };
  GearManage: undefined;
  FindFriends: undefined;
  FollowList: { userId: string; type: 'followers' | 'following' };
  Friends: undefined;
  PointHistory: undefined;
};

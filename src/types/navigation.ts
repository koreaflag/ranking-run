// ============================================================
// React Navigation Type Definitions
// ============================================================

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
};

export type AuthStackParamList = {
  Login: undefined;
  Onboarding: undefined;
};

export type MainTabParamList = {
  WorldTab: undefined;
  HomeTab: undefined;
  CourseTab: undefined;
  RunningTab: undefined;
  MyPageTab: undefined;
};

export type WorldStackParamList = {
  World: undefined;
  CourseDetail: { courseId: string };
  UserProfile: { userId: string };
};

export type HomeStackParamList = {
  Home: undefined;
  CourseDetail: { courseId: string };
  RunHistory: undefined;
  UserProfile: { userId: string };
};

export type CourseStackParamList = {
  CourseList: undefined;
  CourseDetail: { courseId: string; openReview?: boolean };
  CourseRanking: { courseId: string };
  CourseCreate: {
    runRecordId: string;
    routePoints: Array<{ latitude: number; longitude: number }>;
    distanceMeters: number;
    durationSeconds: number;
    elevationGainMeters: number;
  };
  UserProfile: { userId: string };
};

export type RunningStackParamList = {
  RunningMain: { courseId?: string } | undefined;
  RunResult: { sessionId: string };
};

export type MyPageStackParamList = {
  MyPage: undefined;
  RunHistory: undefined;
  RunDetail: { runId: string };
  MyCourses: undefined;
  CourseDetail: { courseId: string };
  Settings: undefined;
  ProfileEdit: undefined;
  UserProfile: { userId: string };
  ImportActivity: undefined;
  StravaConnect: undefined;
};

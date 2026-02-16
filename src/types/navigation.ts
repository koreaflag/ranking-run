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
  HomeTab: undefined;
  CourseTab: undefined;
  RunningTab: undefined;
  MyPageTab: undefined;
};

export type HomeStackParamList = {
  Home: undefined;
  CourseDetail: { courseId: string };
  RunHistory: undefined;
};

export type CourseStackParamList = {
  CourseList: undefined;
  CourseDetail: { courseId: string };
  CourseRanking: { courseId: string };
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
  Settings: undefined;
  ProfileEdit: undefined;
};

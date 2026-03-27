// ============================================================
// RUNVS API Type Definitions
// Matches the API schema defined in api-schema.md
// ============================================================

// ---- Common ----

export interface APIError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface PaginatedResponse<T> {
  data: T[];
  total_count: number;
  has_next: boolean;
}

// ---- Auth ----

export type AuthProvider = 'apple' | 'google';

export interface LoginRequest {
  provider: AuthProvider;
  token: string;
  nonce?: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: number;
  user: {
    id: string;
    user_code?: string;
    email: string;
    nickname?: string;
    provider?: AuthProvider;
    is_new_user: boolean;
  };
}

export interface RefreshRequest {
  refresh_token: string;
}

export interface RefreshResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

// ---- User / Profile ----

export interface UserProfile {
  id: string;
  user_code: string;
  email: string;
  nickname: string;
  avatar_url: string | null;
  birthday: string | null;
  gender: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  bio: string | null;
  instagram_username: string | null;
  country: string | null;
  activity_region?: string;
  crew_name?: string | null;
  total_distance_meters: number;
  total_runs: number;
  total_points: number;
  runner_level?: number;
  created_at: string;
}

export interface ProfileSetupRequest {
  nickname: string;
  avatar_url?: string;
  country?: string;
}

export interface ProfileUpdateRequest {
  nickname?: string;
  avatar_url?: string | null;
  birthday?: string | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  bio?: string | null;
  instagram_username?: string | null;
  country?: string | null;
  activity_region?: string | null;
  crew_name?: string | null;
}

export interface ProfileSetupResponse {
  id: string;
  nickname: string;
  avatar_url: string | null;
  total_distance_meters: number;
  total_runs: number;
  total_points?: number;
  created_at: string;
}

// ---- User Stats ----

export type StatsPeriod = 'all' | 'week' | 'month' | 'year';

export interface MonthlyDistance {
  month: string;
  distance_meters: number;
  run_count: number;
}

export interface UserStats {
  total_distance_meters: number;
  total_duration_seconds: number;
  total_runs: number;
  avg_pace_seconds_per_km: number | null;
  avg_distance_per_run_meters: number;
  best_pace_seconds_per_km: number | null;
  longest_run_meters: number;
  total_elevation_gain_meters: number;
  estimated_calories: number;
  current_streak_days: number;
  best_streak_days: number;
  courses_created: number;
  courses_completed: number;
  total_course_runs: number;
  ranking_top10_count: number;
  monthly_distance: MonthlyDistance[];
}

export interface WeeklySummary {
  total_distance_meters: number;
  total_duration_seconds: number;
  run_count: number;
  avg_pace_seconds_per_km: number | null;
  compared_to_last_week_percent: number;
}

// ---- Analytics ----

export interface WeeklyStatItem {
  week_start: string;
  distance_meters: number;
  run_count: number;
  duration_seconds: number;
  avg_pace: number | null;
}

export interface PaceTrendItem {
  date: string;
  avg_pace: number;
  distance_meters: number;
}

export interface ActivityDay {
  date: string;
  distance_meters: number;
  run_count: number;
}

export interface BestEffortItem {
  distance_label: string;
  target_meters: number;
  best_time_seconds: number | null;
  best_pace: number | null;
  achieved_date: string | null;
  run_id: string | null;
}

export interface AnalyticsData {
  weekly_stats: WeeklyStatItem[];
  pace_trend: PaceTrendItem[];
  activity_calendar: ActivityDay[];
  best_efforts: BestEffortItem[];
  weekly_goal_km: number;
  weekly_current_km: number;
}

// ---- Courses ----

export interface CourseCreator {
  id: string;
  nickname: string;
  avatar_url: string | null;
}

export interface CourseStats {
  total_runs: number;
  unique_runners: number;
  avg_pace_seconds_per_km: number | null;
}

export interface CourseListItem {
  id: string;
  title: string;
  thumbnail_url: string | null;
  route_preview: number[][] | null;
  distance_meters: number;
  estimated_duration_seconds: number;
  elevation_gain_meters: number;
  creator: CourseCreator;
  stats: CourseStats;
  like_count?: number;
  my_best_duration_seconds?: number | null;
  active_runners?: number;
  created_at: string;
  distance_from_user_meters?: number;
}

export type CourseListResponse = PaginatedResponse<CourseListItem>;

export interface CourseListParams {
  search?: string;
  min_distance?: number;
  max_distance?: number;
  near_lat?: number;
  near_lng?: number;
  near_radius?: number;
  order_by?: 'created_at' | 'total_runs' | 'distance_meters' | 'distance_from_user';
  order?: 'asc' | 'desc';
  page?: number;
  per_page?: number;
}

export type CourseDifficulty = 'easy' | 'normal' | 'hard' | 'expert' | 'legend';

export interface NearbyCourse {
  id: string;
  title: string;
  thumbnail_url: string | null;
  route_preview: number[][] | null;
  distance_meters: number;
  estimated_duration_seconds: number;
  total_runs: number;
  avg_pace_seconds_per_km: number | null;
  creator_nickname: string;
  distance_from_user_meters: number;
  difficulty?: CourseDifficulty;
  avg_rating?: number | null;
  active_runners?: number;
  like_count?: number;
}

export interface CourseDominionBrief {
  crew_id: string;
  crew_name: string;
  crew_badge_color: string | null;
  crew_logo_url: string | null;
}

export interface DominionMemberInfo {
  user_id: string;
  nickname: string | null;
  avatar_url: string | null;
  best_duration_seconds: number;
}

export interface CourseDominionInfo {
  course_id: string;
  crew_id: string;
  crew_name: string;
  crew_logo_url: string | null;
  crew_badge_color: string | null;
  crew_badge_icon: string | null;
  avg_duration_seconds: number;
  top_members: DominionMemberInfo[];
  dominated_since: string;
  points_accumulated: number;
}

export interface CourseMarker {
  id: string;
  title: string;
  start_lat: number;
  start_lng: number;
  distance_meters: number;
  total_runs: number;
  difficulty?: CourseDifficulty | null;
  avg_rating?: number | null;
  active_runners?: number;
  is_new?: boolean;
  elevation_gain_meters?: number;
  creator_nickname?: string | null;
  user_rank?: number | null;
  dominion?: CourseDominionBrief | null;
}

export interface GeoJSONLineString {
  type: 'LineString';
  coordinates: [number, number, number][]; // [lng, lat, alt]
}

export interface CourseCheckpoint {
  id: number;
  order: number;
  lat: number;
  lng: number;
  distance_from_start_meters: number;
}

export interface CourseDetail {
  id: string;
  title: string;
  description: string | null;
  route_geometry: GeoJSONLineString;
  distance_meters: number;
  estimated_duration_seconds: number;
  elevation_gain_meters: number;
  elevation_profile: number[];
  thumbnail_url: string | null;
  is_public: boolean;
  created_at: string;
  creator: CourseCreator;
  checkpoints?: CourseCheckpoint[] | null;
  dominion?: CourseDominionBrief | null;
}

export interface CourseDetailStats {
  course_id: string;
  total_runs: number;
  unique_runners: number;
  avg_duration_seconds: number;
  avg_pace_seconds_per_km: number;
  best_duration_seconds: number;
  best_pace_seconds_per_km: number;
  completion_rate: number;
  runs_by_hour: Record<string, number>;
  updated_at: string;
}

export interface CourseCreateRequest {
  run_record_id: string;
  title: string;
  description?: string;
  route_geometry: GeoJSONLineString;
  distance_meters: number;
  estimated_duration_seconds: number;
  elevation_gain_meters: number;
  elevation_profile: number[];
  is_public: boolean;
  tags?: string[];
  course_type?: 'normal' | 'loop';
  lap_count?: number;
}

export interface CourseCreateResponse {
  id: string;
  title: string;
  distance_meters: number;
  thumbnail_url: string | null;
  share_url: string | null;
  created_at: string;
}

export interface MyCourse {
  id: string;
  title: string;
  description: string | null;
  distance_meters: number;
  thumbnail_url: string | null;
  is_public: boolean;
  course_type: 'normal' | 'loop' | null;
  lap_count: number | null;
  created_at: string;
  stats: CourseStats;
}

// ---- Rankings ----

export interface RankingUser {
  id: string;
  nickname: string;
  avatar_url: string | null;
  crew_name?: string | null;
  runner_level?: number;
  country?: string | null;
}

export interface RankingEntry {
  rank: number;
  user: RankingUser;
  best_duration_seconds: number;
  best_pace_seconds_per_km: number;
  achieved_at: string;
  run_count?: number;
  percentile?: number | null;
  gps_verified?: boolean;
}

export interface RankingFilterParams {
  scope?: 'all_time' | 'season';
  gender?: 'male' | 'female';
  age_group?: string;
  crew_id?: string;
  country?: string;
}

export interface RankingListResponse {
  data: RankingEntry[];
  my_ranking: {
    rank: number;
    best_duration_seconds: number;
    best_pace_seconds_per_km: number;
    percentile?: number | null;
    rank_change?: number | null;
  } | null;
  total_runners: number;
}

export interface MyRanking {
  rank: number | null;
  best_duration_seconds: number | null;
  total_runners: number;
  percentile: number | null;
  rank_change?: number | null;
}

export interface MyBestRecord {
  id: string;
  duration_seconds: number;
  avg_pace_seconds_per_km: number;
  finished_at: string;
}

// ---- Weekly Leaderboard ----

export interface WeeklyRunnerEntry {
  rank: number;
  user: RankingUser;
  total_distance_meters: number;
  run_count: number;
  total_duration_seconds: number;
}

export interface WeeklyLeaderboardResponse {
  data: WeeklyRunnerEntry[];
  my_ranking: WeeklyRunnerEntry | null;
  period_start: string;
  period_end: string;
}

// ---- User Search ----

export interface UserSearchItem {
  id: string;
  nickname: string | null;
  avatar_url: string | null;
  crew_name: string | null;
  activity_region: string | null;
}

export interface UserSearchResponse {
  data: UserSearchItem[];
  total_count: number;
  has_next: boolean;
}

// ---- Group Runs ----

export interface GroupRunMemberInfo {
  user_id: string;
  nickname: string | null;
  avatar_url: string | null;
  status: 'invited' | 'accepted' | 'completed';
  best_duration_seconds: number | null;
  best_pace_seconds_per_km: number | null;
}

export interface GroupRankingInfo {
  rank: number | null;
  avg_duration_seconds: number;
}

export interface GroupRunItem {
  id: string;
  course_id: string;
  course_name: string | null;
  name: string;
  creator_id: string | null;
  status: 'active' | 'completed';
  member_count: number;
  members: GroupRunMemberInfo[];
  my_status: 'invited' | 'accepted' | 'completed' | null;
  group_ranking: GroupRankingInfo | null;
  created_at: string;
}

export interface GroupRankingEntry {
  rank: number;
  group_run_id: string;
  group_name: string;
  avg_duration_seconds: number;
  completed_count: number;
  total_members: number;
  members: GroupRunMemberInfo[];
  achieved_at: string;
}

export interface GroupRankingListResponse {
  data: GroupRankingEntry[];
  my_groups: GroupRankingEntry[];
  total_groups: number;
}

export interface GroupRunListResponse {
  data: GroupRunItem[];
  total_count: number;
}

// ---- Crew Challenges (Raid Run) ----

export interface CrewChallengeRecordInfo {
  user_id: string;
  nickname: string | null;
  avatar_url: string | null;
  best_duration_seconds: number | null;
  best_pace_seconds_per_km: number | null;
  completed_at: string | null;
  run_count: number;
}

export interface CrewChallengeItem {
  id: string;
  crew_id: string;
  course_id: string;
  course_name: string | null;
  course_distance_meters: number | null;
  created_by: string | null;
  status: 'active' | 'ended';
  records: CrewChallengeRecordInfo[];
  completed_count: number;
  total_participants: number;
  created_at: string;
  ended_at: string | null;
}

export interface CrewChallengeHistoryResponse {
  data: CrewChallengeItem[];
  total_count: number;
}

export interface CrewCourseRankingEntry {
  rank: number;
  crew_id: string;
  crew_name: string;
  crew_logo_url: string | null;
  crew_badge_color: string;
  avg_duration_seconds: number;
  completed_count: number;
  total_participants: number;
  achieved_at: string;
}

export interface CrewCourseRankingListResponse {
  data: CrewCourseRankingEntry[];
  my_crews: CrewCourseRankingEntry[];
  total_crews: number;
}

// ---- Running Session ----

export interface DeviceInfo {
  platform: 'android' | 'ios';
  os_version: string;
  device_model: string;
  app_version: string;
}

export interface CreateSessionRequest {
  course_id: string | null;
  started_at: string;
  device_info: DeviceInfo;
}

export interface CreateSessionResponse {
  session_id: string;
  created_at: string;
}

export interface ChunkSummary {
  distance_meters: number;
  duration_seconds: number;
  avg_pace_seconds_per_km: number;
  elevation_change_meters: number;
  point_count: number;
  start_timestamp: number;
  end_timestamp: number;
}

export interface CumulativeSummary {
  total_distance_meters: number;
  total_duration_seconds: number;
  avg_pace_seconds_per_km: number;
}

export interface Split {
  split_number: number;
  distance_meters: number;
  duration_seconds: number;
  pace_seconds_per_km: number;
  elevation_change_meters: number;
}

export interface PauseInterval {
  paused_at: string;
  resumed_at: string;
}

export interface RawGPSPointAPI {
  lat: number;
  lng: number;
  alt: number;
  speed: number;
  bearing: number;
  accuracy: number;
  timestamp: number;
}

export interface FilteredPointAPI {
  lat: number;
  lng: number;
  alt: number;
  speed: number;
  bearing: number;
  timestamp: number;
  is_interpolated: boolean;
}

export interface UploadChunkRequest {
  session_id: string;
  sequence: number;
  chunk_type: 'intermediate' | 'final' | 'emergency';
  raw_gps_points: RawGPSPointAPI[];
  filtered_points?: FilteredPointAPI[];
  chunk_summary: ChunkSummary;
  cumulative: CumulativeSummary;
  completed_splits: Split[];
  pause_intervals: PauseInterval[];
}

export interface UploadChunkResponse {
  chunk_id: string;
  sequence: number;
  received_at: string;
}

export interface CourseCompletion {
  is_completed: boolean;
  max_deviation_meters: number;
  deviation_points: number;
  route_match_percent: number;
}

export interface FilterConfig {
  kalman_q: number;
  kalman_r_base: number;
  outlier_speed_threshold: number;
  outlier_accuracy_threshold: number;
}

export interface CheckpointPass {
  checkpoint_id: number;
  timestamp: number;
  distance_from_checkpoint: number;
}

export interface CompleteRunRequest {
  distance_meters: number;
  duration_seconds: number;
  total_elapsed_seconds: number;
  avg_pace_seconds_per_km: number;
  best_pace_seconds_per_km: number;
  avg_speed_ms: number;
  max_speed_ms: number;
  calories: number | null;
  finished_at: string;
  route_geometry: GeoJSONLineString;
  elevation_gain_meters: number;
  elevation_loss_meters: number;
  elevation_profile: number[];
  splits: Split[];
  pause_intervals: PauseInterval[];
  course_completion?: CourseCompletion;
  filter_config: FilterConfig;
  total_chunks: number;
  uploaded_chunk_sequences: number[];
  checkpoint_passes?: CheckpointPass[];
}

export interface RunCompleteResponse {
  run_record_id: string;
  ranking?: {
    rank: number;
    total_runners: number;
    is_personal_best: boolean;
    previous_best_duration?: number;
  };
  is_flagged?: boolean;
  flag_reason?: string;
  route_match_percent?: number;
  max_deviation_meters?: number;
  user_stats_update: {
    total_distance_meters: number;
    total_runs: number;
    streak_days: number;
    runner_level: number;
  };
  missing_chunk_sequences: number[];
  points_earned: number;
  course_streak?: number;
  map_matching_confidence?: number;
}

// ---- Run Records ----

export interface RunGoalData {
  type: string;
  value?: number | null;
  intervalRunSeconds?: number;
  intervalWalkSeconds?: number;
  intervalSets?: number;
  targetTime?: number | null;
  cadenceBPM?: number | null;
}

export interface RecentRun {
  id: string;
  distance_meters: number;
  duration_seconds: number;
  avg_pace_seconds_per_km: number;
  started_at: string;
  finished_at: string;
  course: {
    id: string;
    title: string;
  } | null;
  route_preview?: number[][] | null;
  goal_data?: RunGoalData | null;
}

export interface RunHistoryItem {
  id: string;
  distance_meters: number;
  duration_seconds: number;
  avg_pace_seconds_per_km: number;
  elevation_gain_meters: number;
  started_at: string;
  finished_at: string;
  course: {
    id: string;
    title: string;
  } | null;
  device_model?: string | null;
  route_preview?: number[][] | null;
  goal_data?: RunGoalData | null;
}

export type RunHistoryResponse = PaginatedResponse<RunHistoryItem>;

export interface RunRecordDetail {
  id: string;
  user_id: string;
  course_id: string | null;
  distance_meters: number;
  duration_seconds: number;
  total_elapsed_seconds: number;
  avg_pace_seconds_per_km: number;
  best_pace_seconds_per_km: number;
  avg_speed_ms: number;
  max_speed_ms: number;
  calories: number | null;
  elevation_gain_meters: number;
  elevation_loss_meters: number;
  route_geometry: GeoJSONLineString | null;
  elevation_profile: number[] | null;
  splits: Split[] | null;
  started_at: string;
  finished_at: string;
  course: {
    id: string;
    title: string;
    distance_meters: number;
  } | null;
  course_completion?: {
    is_completed: boolean;
    route_match_percent: number;
    ranking_at_time: number | null;
  };
  goal_data?: RunGoalData | null;
}

// ---- Reviews ----

export interface ReviewAuthor {
  id: string;
  nickname: string | null;
  avatar_url: string | null;
}

export interface CourseReview {
  id: string;
  course_id: string;
  rating: number | null;
  content: string | null;
  author: ReviewAuthor;
  created_at: string;
  updated_at: string;
  creator_reply: string | null;
  creator_reply_at: string | null;
}

export interface CourseReviewListResponse {
  data: CourseReview[];
  total_count: number;
  avg_rating: number | null;
}

export interface ReviewCreateRequest {
  rating?: number;
  content?: string;
}

export interface ReviewUpdateRequest {
  rating?: number;
  content?: string;
}

// ---- Favorites ----

export interface FavoriteToggleResponse {
  is_favorited: boolean;
}

export interface FavoriteCourseItem {
  id: string;
  title: string;
  thumbnail_url: string | null;
  route_preview?: number[][] | null;
  distance_meters: number;
  estimated_duration_seconds: number;
  creator_nickname: string;
  favorited_at: string;
}

// ---- Likes ----

export interface LikeToggleResponse {
  is_liked: boolean;
  like_count: number;
}

export interface LikeStatusResponse {
  is_liked: boolean;
  like_count: number;
}

// ---- Public Profile ----

export interface PublicProfileCourse {
  id: string;
  title: string;
  distance_meters: number;
  thumbnail_url: string | null;
  route_preview: number[][] | null;
  total_runs: number;
  like_count: number;
}

export interface PublicProfileRanking {
  course_id: string;
  course_title: string;
  rank: number;
  best_duration_seconds: number;
}

export interface PublicProfile {
  id: string;
  user_code?: string;
  nickname: string | null;
  avatar_url: string | null;
  bio: string | null;
  instagram_username: string | null;
  activity_region?: string;
  country?: string | null;
  crew_name?: string | null;
  runner_level?: number;
  total_distance_meters: number;
  total_runs: number;
  total_points?: number;
  total_likes_received?: number;
  created_at: string;
  followers_count: number;
  following_count: number;
  is_following: boolean;
  courses: PublicProfileCourse[];
  top_rankings: PublicProfileRanking[];
  primary_gear?: GearItem | null;
  gear_items?: GearItem[];
}

// ---- Social Counts ----

export interface SocialCounts {
    followers_count: number;
    following_count: number;
    total_likes_received: number;
}

// ---- Live Running Friends ----

export interface FriendRunning {
  user_id: string;
  nickname: string;
  avatar_url: string | null;
  started_at: string;
  course_title: string | null;
  course_id: string | null;
}

// ---- Activity Feed ----

export interface ActivityFeedItem {
    type: 'run_completed' | 'course_created';
    user_id: string;
    nickname: string | null;
    avatar_url: string | null;
    // Run fields
    run_id: string | null;
    distance_meters: number | null;
    duration_seconds: number | null;
    avg_pace_seconds_per_km: number | null;
    course_title: string | null;
    // Course fields
    course_id: string | null;
    course_title_created: string | null;
    course_distance_meters: number | null;
    // Common
    created_at: string;
}

export interface ActivityFeedResponse {
    data: ActivityFeedItem[];
}

// ---- Follow List ----

export interface FollowUserInfo {
  id: string;
  nickname: string | null;
  avatar_url: string | null;
}

export interface FollowListItem {
  id: string;
  user: FollowUserInfo;
  created_at: string;
}

export interface FollowListResponse {
  data: FollowListItem[];
  total_count: number;
}

// ---- Events ----

export type EventType = 'challenge' | 'crew' | 'event';

export interface EventItem {
  id: string;
  title: string;
  description: string | null;
  event_type: EventType;
  course_id: string | null;
  starts_at: string;
  ends_at: string;
  target_distance_meters: number | null;
  target_runs: number | null;
  badge_color: string;
  badge_icon: string;
  participant_count: number;
  is_participating: boolean;
  is_active: boolean;
  center_lat: number | null;
  center_lng: number | null;
  recurring_schedule: string | null;
  meeting_point: string | null;
  creator_nickname: string | null;
  my_progress_distance_meters: number | null;
  my_progress_runs: number | null;
}

export interface EventListResponse {
  data: EventItem[];
  total_count: number;
}

export interface EventParticipantInfo {
  event_id: string;
  user_id: string;
  progress_distance_meters: number;
  progress_runs: number;
  completed: boolean;
  joined_at: string;
}

// ---- Crew Chat ----

export interface CrewMessageItem {
  id: string;
  event_id: string;
  user_id: string | null;
  nickname: string | null;
  avatar_url: string | null;
  content: string;
  message_type: 'text' | 'system' | 'image';
  created_at: string;
}

export interface CrewMessageListResponse {
  data: CrewMessageItem[];
  has_more: boolean;
}

export interface CrewUnreadItem {
  event_id: string;
  title: string;
  unread_count: number;
}

export interface CrewAllUnreadResponse {
  crews: CrewUnreadItem[];
}

// ---- Crews ----

export interface CrewOwnerInfo {
  id: string;
  nickname: string | null;
  avatar_url: string | null;
}

export interface CrewItem {
  id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  cover_image_url: string | null;
  region: string | null;
  owner: CrewOwnerInfo;
  member_count: number;
  max_members: number | null;
  is_public: boolean;
  badge_color: string;
  badge_icon: string;
  recurring_schedule: string | null;
  meeting_point: string | null;
  requires_approval: boolean;
  level: number;
  total_xp: number;
  grade_config: { levels: Record<string, { name: string }> } | null;
  is_member: boolean;
  my_role: string | null;
  join_request_status: string | null;
  last_activity_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrewListResponse {
  data: CrewItem[];
  total_count: number;
}

export interface CrewMemberItem {
  user_id: string;
  nickname: string | null;
  avatar_url: string | null;
  role: string;
  grade_level: number;
  joined_at: string;
}

export interface CrewManagementStats {
  total_members: number;
  members_by_grade: Record<number, number>;
  pending_requests: number;
  recent_joins_7d: number;
  recent_leaves_7d: number;
}

export interface CrewMemberListResponse {
  data: CrewMemberItem[];
  total_count: number;
}

export interface CrewCreateRequest {
  name: string;
  description?: string;
  logo_url?: string;
  cover_image_url?: string;
  region?: string;
  max_members?: number;
  is_public?: boolean;
  badge_color?: string;
  badge_icon?: string;
  recurring_schedule?: string;
  meeting_point?: string;
  requires_approval?: boolean;
}

// ---- Crew Join Requests ----

export interface CrewJoinRequestUser {
  id: string;
  nickname: string | null;
  avatar_url: string | null;
}

export interface CrewJoinRequestItem {
  id: string;
  user: CrewJoinRequestUser;
  message: string | null;
  status: string;
  created_at: string;
  reviewed_at: string | null;
}

export interface CrewJoinRequestListResponse {
  data: CrewJoinRequestItem[];
  total_count: number;
}

export interface MyJoinRequestStatus {
  status: string | null;
  request_id: string | null;
}

// ---- Crew Weekly Ranking ----

export interface CrewWeeklyRankingItem {
  user_id: string;
  nickname: string | null;
  avatar_url: string | null;
  weekly_distance: number;
  weekly_runs: number;
  rank: number;
}

export interface CrewWeeklyRankingResponse {
  data: CrewWeeklyRankingItem[];
}

export interface CrewWeeklyStats {
  total_distance_meters: number;
  total_runs: number;
  active_members: number;
  avg_pace_seconds_per_km: number | null;
}

export interface CrewActiveCourse {
  course_id: string;
  course_title: string;
  distance_meters: number;
  member_run_count: number;
  best_crew_time_seconds: number | null;
}

// ---- Point Transactions ----

export interface PointTransactionItem {
  id: string;
  amount: number;
  balance_after: number;
  tx_type: string;
  description: string | null;
  created_at: string;
}

export interface PointHistoryResponse {
  data: PointTransactionItem[];
  total_count: number;
  has_next: boolean;
}

// ---- Announcements ----

export interface AnnouncementItem {
  id: string;
  title: string;
  content: string | null;
  image_url: string | null;
  link_type: string;
  link_value: string | null;
  priority: number;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
}

export interface AnnouncementListResponse {
  data: AnnouncementItem[];
}

// ---- Notifications ----

export interface NotificationActor {
  id: string;
  nickname: string | null;
  avatar_url: string | null;
}

export interface NotificationItem {
  id: string;
  type: string;
  actor: NotificationActor;
  target_id: string | null;
  target_type: string | null;
  data: Record<string, any> | null;
  is_read: boolean;
  created_at: string;
}

export interface NotificationListResponse {
  data: NotificationItem[];
  total_count: number;
  unread_count: number;
}

// ---- Community Board ----

export interface PostAuthor {
  id: string;
  nickname: string | null;
  avatar_url: string | null;
  crew_name?: string | null;
  crew_grade_level?: number | null;
}

export type CommunityPostType = 'general' | 'crew_promo' | 'question';

export interface CommunityPostItem {
  id: string;
  title: string | null;
  content: string;
  post_type: CommunityPostType;
  event_id: string | null;
  event_title: string | null;
  crew_id: string | null;
  image_url: string | null;
  image_urls: string[] | null;
  like_count: number;
  comment_count: number;
  is_liked: boolean;
  author: PostAuthor;
  created_at: string;
}

export interface CommunityPostListResponse {
  data: CommunityPostItem[];
  total_count: number;
}

export interface CommunityCommentItem {
  id: string;
  content: string;
  author: PostAuthor;
  created_at: string;
}

export interface CommunityCommentListResponse {
  data: CommunityCommentItem[];
  total_count: number;
}

// ---- Course Comments ----

export interface CourseCommentAuthor {
  id: string;
  nickname: string | null;
  profile_image_url: string | null;
}

export interface CourseCommentItem {
  id: string;
  course_id: string;
  author: CourseCommentAuthor;
  content: string;
  image_urls: string[] | null;
  parent_id: string | null;
  replies: CourseCommentItem[];
  reply_count: number;
  created_at: string;
}

export interface CourseCommentListResponse {
  data: CourseCommentItem[];
  total_count: number;
}

// ---- Uploads ----

export interface AvatarUploadResponse {
  url: string;
}

// ---- External Import ----

export interface ImportUploadResponse {
  import_id: string;
  status: string;
  message: string;
}

export interface ImportSummary {
  distance_meters: number;
  duration_seconds: number;
  avg_pace_seconds_per_km: number | null;
  elevation_gain_meters: number;
  elevation_loss_meters: number;
  point_count: number;
  source_device: string | null;
}

export interface CourseMatchInfo {
  course_id: string;
  course_title: string;
  match_percent: number;
  is_completed: boolean;
}

export interface ImportDetailResponse {
  id: string;
  source: string;
  status: string;
  external_id: string | null;
  original_filename: string | null;
  import_summary: ImportSummary | null;
  course_match: CourseMatchInfo | null;
  run_record_id: string | null;
  error_message: string | null;
  created_at: string;
}

export interface ImportListResponse {
  data: ImportDetailResponse[];
  total_count: number;
  has_next: boolean;
}

// ---- Gear ----

export interface GearItem {
  id: string;
  brand: string;
  model_name: string;
  image_url?: string;
  is_primary: boolean;
  total_distance_meters: number;
  created_at: string;
}

export interface GearCreateRequest {
  brand: string;
  model_name: string;
  image_url?: string;
  is_primary?: boolean;
}

export interface GearUpdateRequest {
  brand?: string;
  model_name?: string;
  image_url?: string;
  is_primary?: boolean;
}

// ---- Strava Integration ----

export interface StravaAuthURLResponse {
  auth_url: string;
  state: string;
}

export interface StravaConnectionStatus {
  connected: boolean;
  athlete_name: string | null;
  athlete_profile_url: string | null;
  last_sync_at: string | null;
  auto_sync: boolean;
}

export interface StravaActivity {
  id: number;
  name: string | null;
  sport_type: string | null;
  start_date: string | null;
  distance: number | null;
  moving_time: number | null;
  total_elevation_gain: number | null;
}

export interface StravaSyncResponse {
  import_id: string;
  status: string;
  message: string;
}

// ---- User Code Search ----

export interface UserSearchByCodeResult {
  id: string;
  user_code: string;
  nickname: string | null;
  avatar_url: string | null;
  bio: string | null;
  total_distance_meters: number;
  total_runs: number;
  is_following: boolean;
}

// ---- Friend Request System ----

export interface FriendRequestUserInfo {
  id: string;
  nickname: string | null;
  avatar_url: string | null;
}

export interface FriendRequestItem {
  id: string;
  requester: FriendRequestUserInfo;
  recipient: FriendRequestUserInfo;
  status: string;
  created_at: string;
}

export interface FriendRequestListResponse {
  data: FriendRequestItem[];
  total_count: number;
}

export interface FriendItem {
  id: string;
  user: FriendRequestUserInfo;
  since: string;
}

export interface FriendListResponse {
  data: FriendItem[];
  total_count: number;
}

export interface FriendshipStatusResponse {
  is_friend: boolean;
  request_status: 'pending_sent' | 'pending_received' | 'accepted' | null;
  friends_count: number;
}

// ---- Contact-based Friend Recommendation ----

export interface ContactMatchUser {
  id: string;
  nickname: string | null;
  avatar_url: string | null;
  bio: string | null;
  total_distance_meters: number;
  total_runs: number;
}

export interface MatchContactsResponse {
  matches: ContactMatchUser[];
  total_count: number;
}

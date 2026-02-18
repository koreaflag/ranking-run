// ============================================================
// RunCrew API Type Definitions
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

export type AuthProvider = 'kakao' | 'apple' | 'google';

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
  email: string;
  nickname: string;
  avatar_url: string | null;
  birthday: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  bio: string | null;
  instagram_username: string | null;
  total_distance_meters: number;
  total_runs: number;
  created_at: string;
}

export interface ProfileSetupRequest {
  nickname: string;
  avatar_url?: string;
}

export interface ProfileUpdateRequest {
  nickname?: string;
  avatar_url?: string | null;
  birthday?: string | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  bio?: string | null;
  instagram_username?: string | null;
}

export interface ProfileSetupResponse {
  id: string;
  nickname: string;
  avatar_url: string | null;
  total_distance_meters: number;
  total_runs: number;
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
  distance_meters: number;
  estimated_duration_seconds: number;
  elevation_gain_meters: number;
  creator: CourseCreator;
  stats: CourseStats;
  like_count?: number;
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
}

export interface GeoJSONLineString {
  type: 'LineString';
  coordinates: [number, number, number][]; // [lng, lat, alt]
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
}

export interface CourseCreateResponse {
  id: string;
  title: string;
  distance_meters: number;
  thumbnail_url: string;
  share_url: string;
  created_at: string;
}

export interface MyCourse {
  id: string;
  title: string;
  distance_meters: number;
  thumbnail_url: string | null;
  is_public: boolean;
  created_at: string;
  stats: CourseStats;
}

// ---- Rankings ----

export interface RankingUser {
  id: string;
  nickname: string;
  avatar_url: string | null;
}

export interface RankingEntry {
  rank: number;
  user: RankingUser;
  best_duration_seconds: number;
  best_pace_seconds_per_km: number;
  achieved_at: string;
  run_count?: number;
}

export interface RankingListResponse {
  data: RankingEntry[];
  my_ranking: {
    rank: number;
    best_duration_seconds: number;
    best_pace_seconds_per_km: number;
  } | null;
  total_runners: number;
}

export interface MyRanking {
  rank: number | null;
  best_duration_seconds: number | null;
  total_runners: number;
  percentile: number | null;
}

export interface MyBestRecord {
  id: string;
  duration_seconds: number;
  avg_pace_seconds_per_km: number;
  finished_at: string;
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

export interface UploadChunkRequest {
  session_id: string;
  sequence: number;
  chunk_type: 'intermediate' | 'final';
  raw_gps_points: RawGPSPointAPI[];
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
}

export interface RunCompleteResponse {
  run_record_id: string;
  ranking?: {
    rank: number;
    total_runners: number;
    is_personal_best: boolean;
    previous_best_duration?: number;
  };
  user_stats_update: {
    total_distance_meters: number;
    total_runs: number;
    streak_days: number;
  };
  missing_chunk_sequences: number[];
}

// ---- Run Records ----

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
  route_geometry: GeoJSONLineString;
  elevation_profile: number[];
  splits: Split[];
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
    ranking_at_time: number;
  };
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
  nickname: string | null;
  avatar_url: string | null;
  bio: string | null;
  instagram_username: string | null;
  total_distance_meters: number;
  total_runs: number;
  created_at: string;
  followers_count: number;
  following_count: number;
  is_following: boolean;
  courses: PublicProfileCourse[];
  top_rankings: PublicProfileRanking[];
}

// ---- Social Counts ----

export interface SocialCounts {
    followers_count: number;
    following_count: number;
    total_likes_received: number;
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

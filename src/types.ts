export interface PostImage {
  id: string;
  source: string;
  localPath: string;
  previewUrl: string;
}

export interface ScheduledPost {
  id: string;
  scheduledAt: Date;
  text: string;
  images: PostImage[];
  status: 'pending' | 'scheduling' | 'scheduled' | 'failed';
  error?: string;
}

export interface ParseResult {
  posts: ScheduledPost[];
  warnings: string[];
  errors: string[];
}

export interface ScheduleResult {
  post: ScheduledPost;
  status: 'success' | 'failed' | 'skipped';
  error?: string;
}

export interface AppConfig {
  sessionDir: string;
  headless: boolean;
  delayBetweenPosts: number;
  timezone: string;
}

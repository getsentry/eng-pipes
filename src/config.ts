export const SENTRY_DSN =
  'https://34b97f5891a044c6ab1f6ce6332733fb@o1.ingest.sentry.io/5246761';
export const DEFAULT_PORT = 3000;

export const OWNER = 'getsentry';
export const SENTRY_REPO = 'sentry';
export const GETSENTRY_REPO = 'getsentry';
export const GETSENTRY_BOT_ID = 10587625;

// The name of the GitHub Check that is created in getsentry to aggregate "required" jobs
export const REQUIRED_CHECK_NAME = 'getsentry required checks';
export const REQUIRED_CHECK_CHANNEL = '#team-engineering';

// Slack profile IDs
export const SLACK_PROFILE_ID_GITHUB = 'XfEJ1CLM1C';

export enum Color {
  DANGER = '#F55459',
  NEUTRAL = '#C6BECF',
  SUCCESS = '#33BF9E',
}

/**
 * Database settings
 */
export const DB_HOST = process.env.DB_HOST || '/cloudsql';
export const DB_INSTANCE_CONNECTION_NAME =
  process.env.DB_INSTANCE_CONNECTION_NAME;
export const DB_USER = process.env.DB_USER || 'postgres';
export const DB_PASSWORD = process.env.DB_PASSWORD;
export const DB_NAME = process.env.DB_NAME || 'postgres';

/**
 * Slack API
 */
export const SLACK_BOT_USER_ACCESS_TOKEN =
  process.env.SLACK_BOT_USER_ACCESS_TOKEN || '';
export const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET || '';

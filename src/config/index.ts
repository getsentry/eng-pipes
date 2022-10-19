export const SENTRY_DSN =
  (process.env.ENV === 'production' &&
    'https://34b97f5891a044c6ab1f6ce6332733fb@o1.ingest.sentry.io/5246761') ||
  process.env.SENTRY_LOCAL_DSN ||
  '';
export const DEFAULT_PORT = 3000;

export const DAY_IN_MS = 1000 * 60 * 60 * 24;

export const OWNER = process.env.OWNER || 'getsentry';
export const SENTRY_REPO = process.env.SENTRY_REPO || 'sentry';
export const GETSENTRY_REPO = process.env.GETSENTRY_REPO || 'getsentry';
export const GETSENTRY_BOT_ID = 10587625;

// The name of the GitHub Check that is created in getsentry to aggregate "required" jobs
export const REQUIRED_CHECK_NAME = 'getsentry required checks';
export const REQUIRED_CHECK_CHANNEL = '#team-engineering';

// Slack profile IDs
export const SLACK_PROFILE_ID_GITHUB = 'XfEJ1CLM1C';
export const SLACK_BOT_APP_ID = process.env.SLACK_BOT_APP_ID || '';

// Note, these are Sentry palette colors
export enum Color {
  DANGER = '#F55459',
  DANGER_LIGHT = '#FCC6C8',
  NEUTRAL = '#C6BECF',
  OFF_WHITE_TOO = '#E7E1EC',
  SUCCESS = '#33BF9E',
  SUCCESS_LIGHT = '#B6ECDF',
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

/**
 * Freight
 */
export const FREIGHT_HOST = 'https://freight.getsentry.net';

export enum BuildStatus {
  SUCCESS = 'success',
  NEUTRAL = 'neutral',
  SKIPPED = 'skipped',

  FAILURE = 'failure',
  MISSING = 'missing',
  CANCELLED = 'cancelled',
  ACTION_REQUIRED = 'action_required',
  STALE = 'stale',
  TIMED_OUT = 'timed_out',

  UNKNOWN = 'unknown',
  FIXED = 'fixed',
  FLAKE = 'flake',
}

/**
 * GitHub Triage
 */
export const TEAM_LABEL_PREFIX = 'Team: ';
export const UNTRIAGED_LABEL = 'Status: Untriaged';

/**
 * sentry/getsentry Git Bot
 */
export const GIT_BOT_HOST = 'sentry-deploy-sync-hook-dwunkkvj6a-uc.a.run.app';
export const GIT_BOT_SECRET = process.env.GIT_BOT_SECRET || '';

/**
 * Personal Access Token for the Sentry bot used to do things that aren't possible with the App account, e.g. querying org membership
 */
export const GH_USER_TOKEN = process.env.GH_USER_TOKEN || '';

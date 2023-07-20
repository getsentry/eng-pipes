import {
  GitHubAppsRegistry,
  loadGitHubAppsFromEnvironment,
} from './loadGitHubAppsFromEnvironment';

export const SENTRY_DSN =
  (process.env.ENV === 'production' &&
    'https://34b97f5891a044c6ab1f6ce6332733fb@o1.ingest.sentry.io/5246761') ||
  process.env.SENTRY_LOCAL_DSN ||
  '';
export const DEFAULT_PORT = 3000;

export const DAY_IN_MS = 1000 * 60 * 60 * 24;

export const GETSENTRY_ORG = process.env.GETSENTRY_ORG || 'getsentry';
export const SENTRY_REPO = process.env.SENTRY_REPO || 'sentry';
export const GETSENTRY_REPO = process.env.GETSENTRY_REPO || 'getsentry';
export const GETSENTRY_BOT_ID = 10587625;
export const GOCD_SENTRYIO_FE_PIPELINE_NAME =
  process.env.GOCD_SENTRYIO_FE_PIPELINE_NAME || 'getsentry-frontend';
export const GOCD_SENTRYIO_BE_PIPELINE_GROUP =
  process.env.GOCD_SENTRYIO_BE_PIPELINE_GROUP || 'getsentry-backend';
export const GOCD_SENTRYIO_BE_PIPELINE_NAME =
  process.env.GOCD_SENTRYIO_BE_PIPELINE_NAME || 'getsentry-backend';
export const GOCD_ORIGIN =
  process.env.GOCD_ORIGIN || 'https://deploy.getsentry.net';
export const FEED_DEPLOY_CHANNEL_ID =
  process.env.FEED_DEPLOY_CHANNEL_ID || 'C051ED5GLN4';
export const FEED_DEV_INFRA_CHANNEL_ID =
  process.env.FEED_DEV_INFRA_CHANNEL_ID || 'C05816N2A2K';
export const FEED_ENGINEERING_CHANNEL_ID =
  process.env.FEED_ENGINEERING_CHANNEL_ID || 'C1B4LB39D';
export const SUPPORT_CHANNEL_ID = // #discuss-support-open-source
  process.env.SUPPORT_CHANNEL_ID || 'C02KHRNRZ1B';
export const TEAM_OSPO_CHANNEL_ID = // #team-ospo
  process.env.TEAM_OSPO_CHANNEL_ID || 'G01F3FQ0T41';
export const DISABLE_GITHUB_METRICS =
  process.env.DISABLE_GITHUB_METRICS == 'true' ||
  process.env.DISABLE_GITHUB_METRICS == '1';
export const DRY_RUN =
  process.env.DRY_RUN == 'true' || process.env.DRY_RUN == '1';
export const PROJECT =
  process.env.ENV === 'production' ? 'super-big-data' : 'sentry-dev-tooling';

// The name of the GitHub Check that is created in getsentry to aggregate "required" jobs
export const REQUIRED_CHECK_NAME = 'getsentry required checks';
export const REQUIRED_CHECK_CHANNEL = '#team-engineering';

// Slack profile IDs
export const SLACK_PROFILE_ID_GITHUB = 'XfEJ1CLM1C';

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
export const PRODUCT_AREA_LABEL_PREFIX = 'Product Area: ';
export const PRODUCT_AREA_UNKNOWN = 'Product Area: Unknown';
export const STATUS_LABEL_PREFIX = 'Status: ';
export const BACKLOG_LABEL = 'Status: Backlog';
export const IN_PROGRESS_LABEL = 'Status: In Progress';
export const UNKNOWN_LABEL = 'Status: Unknown';
export const STALE_LABEL = 'Stale';
export const WAITING_FOR_LABEL_PREFIX = 'Waiting for: ';
export const WAITING_FOR_SUPPORT_LABEL = 'Waiting for: Support';
export const WAITING_FOR_COMMUNITY_LABEL = 'Waiting for: Community';
export const WAITING_FOR_PRODUCT_OWNER_LABEL = 'Waiting for: Product Owner';
export const MAX_TRIAGE_DAYS = 2;
export const MAX_ROUTE_DAYS = 1;

// Only add the `PERSONAL_TEST_REPO` to the array of `SENTRY_REPOS_WITH_ROUTING` if it has actually been set
// in the instantiating environment.
export const PERSONAL_TEST_REPO = process.env.PERSONAL_TEST_REPO;
export const PERSONAL_TEST_REPOS = PERSONAL_TEST_REPO
  ? [PERSONAL_TEST_REPO]
  : [];

export const SENTRY_REPOS_WITH_ROUTING: Set<string> = new Set([
  'sentry',
  'sentry-docs',
  ...PERSONAL_TEST_REPOS,
]);
export const SENTRY_REPOS_WITHOUT_ROUTING: Set<string> = new Set([
  'arroyo',
  'cdc',
  'craft',
  'relay',
  'responses',
  'self-hosted',
  'sentry-native',
  'snuba',
  'snuba-sdk',
  'symbolic',
  'symbolicator',
  'test-ttt-simple',
  'wal2json',

  // Web team, T1
  'sentry-javascript',
  'sentry-python',
  'sentry-php',
  'sentry-laravel',
  'sentry-symfony',
  'sentry-ruby',

  // Mobile team, T1
  // https://www.notion.so/sentry/346452f21e7947b4bf515d5f3a4d497d?v=cad7f04cf9064e7483ab426a26d3923a
  'sentry-cocoa',
  'sentry-java',
  'sentry-react-native',
  'sentry-unity',
  'sentry-dart',
  'sentry-android-gradle-plugin',
  'sentry-dotnet',
  'sentry-dart-plugin',
]);

export const SENTRY_REPOS: Set<string> = new Set([
  ...SENTRY_REPOS_WITH_ROUTING,
  ...SENTRY_REPOS_WITHOUT_ROUTING,
]);

/**
 * Personal Access Token for the Sentry bot used to do things that aren't possible with the App account, e.g. querying org membership
 */
export const GH_USER_TOKEN = process.env.GH_USER_TOKEN || '';

/**
 * App auth strategy options. For branding purposes, we have one app per org
 * (getsantry for getsentry, covecod for codecov, etc). Down in getClient we
 * will instantiate a GitHub octokit client for each org the first time we need
 * it, then cache it for the duration of our server process as it seems to be
 * smart enough to renew auth tokens as needed. When we do that, we will set
 * installationId. Here in config we need to populate the appId and privateKey
 * from the environment.
 *
 * TODO: Expand from a single app/org to multiple. First we need to clean up
 * getClient calls to use a dynamic owner/org instead of GETSENTRY_ORG as defined above.
 */

export const GH_APPS: GitHubAppsRegistry = loadGitHubAppsFromEnvironment(
  process.env
);

/**
 * Business Hours by Office
 */

export const OFFICE_TIME_ZONES = {
  vie: 'Europe/Vienna',
  ams: 'Europe/Amsterdam',
  yyz: 'America/Toronto',
  sfo: 'America/Los_Angeles',
  sea: 'America/Los_Angeles',
};

export const OFFICES_24_HOUR = ['vie', 'ams', 'yyz'];

export const OFFICES_12_HOUR = ['sfo', 'sea'];

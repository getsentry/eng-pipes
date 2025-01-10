import fs from 'fs';

import yaml from 'js-yaml';
import moment from 'moment-timezone';

import { GoCDPausedPipelineReminder } from '@/types/gocd';

import { makeUserTokenClient } from '../api/github/makeUserTokenClient';

import { loadDatadogApiInstance } from './loadDatadogApiInstance';
import { GitHubOrgs, loadGitHubOrgs } from './loadGitHubOrgs';

export const SENTRY_DSN =
  (process.env.ENV === 'production' &&
    'https://34b97f5891a044c6ab1f6ce6332733fb@o1.ingest.sentry.io/5246761') ||
  process.env.SENTRY_LOCAL_DSN ||
  '';

export const PREDICT_ENDPOINT =
  process.env.PREDICT_ENDPOINT || 'http://127.0.0.1:9002/predict';
export const DEFAULT_PORT = 3000;

export const DAY_IN_MS = 1000 * 60 * 60 * 24;

export const SENTRY_REPO_SLUG = process.env.SENTRY_REPO || 'sentry';
export const GETSENTRY_REPO_SLUG = process.env.GETSENTRY_REPO || 'getsentry';
export const GETSENTRY_BOT_ID = 10587625;
export const GOCD_SENTRYIO_FE_PIPELINE_GROUP =
  process.env.GOCD_SENTRYIO_FE_PIPELINE_GROUP || 'getsentry-frontend';
export const GOCD_SENTRYIO_FE_PIPELINE_NAME =
  process.env.GOCD_SENTRYIO_FE_PIPELINE_NAME || 'getsentry-frontend';
export const GOCD_SENTRYIO_BE_PIPELINE_GROUP =
  process.env.GOCD_SENTRYIO_BE_PIPELINE_GROUP || 'getsentry-backend';
export const GOCD_SENTRYIO_BE_PIPELINE_NAME =
  process.env.GOCD_SENTRYIO_BE_PIPELINE_NAME || 'deploy-getsentry-backend-us';
export const GOCD_ORIGIN =
  process.env.GOCD_ORIGIN || 'https://deploy.getsentry.net';
export const FEED_DEPLOY_CHANNEL_ID =
  process.env.FEED_DEPLOY_CHANNEL_ID || 'C051ED5GLN4';
export const FEED_OPTIONS_AUTOMATOR_CHANNEL_ID =
  process.env.FEED_OPTIONS_AUTOMATOR_CHANNEL_ID || 'C05QM3AUDKJ';
export const FEED_DEV_INFRA_CHANNEL_ID =
  process.env.FEED_DEV_INFRA_CHANNEL_ID || 'C05816N2A2K';
export const FEED_ENGINEERING_CHANNEL_ID =
  process.env.FEED_ENGINEERING_CHANNEL_ID || 'C1B4LB39D';
export const FEED_SNS_SAAS_CHANNEL_ID = // #feed-sns
  process.env.FEED_SNS_SAAS_CHANNEL_ID || 'C0220QQNUHE';
export const FEED_SNS_ST_CHANNEL_ID = // #feed-sns-st
  process.env.FEED_SNS_ST_CHANNEL_ID || 'C0596EHDD9N';
export const FEED_INGEST_CHANNEL_ID = // #discuss-ingest
  process.env.FEED_INGEST_CHANNEL_ID || 'C019637C760';
export const FEED_GOCD_JOB_RUNNER_CHANNEL_ID = // #feed-gocd-job-runner
  process.env.FEED_GOCD_JOB_RUNNER_CHANNEL_ID || 'C07E8TG7VJP';
export const KAFKA_CONTROL_PLANE_CHANNEL_ID = // #feed-topicctl
  process.env.KAFKA_CONTROL_PLANE_CHANNEL_ID || 'C07E9S96YPM';
export const SUPPORT_CHANNEL_ID = // #discuss-support-open-source
  process.env.SUPPORT_CHANNEL_ID || 'C02KHRNRZ1B';
export const TEAM_OSPO_CHANNEL_ID = // #team-ospo
  process.env.TEAM_OSPO_CHANNEL_ID || 'G01F3FQ0T41';
export const TEAM_PRODUCT_OWNERS_CHANNEL_ID =
  process.env.TEAM_PRODUCT_OWNERS_CHANNEL_ID || 'C063DCB4PGF';
export const DISCUSS_PRODUCT_CHANNEL_ID = // #discuss-product
  process.env.DISCUSS_PRODUCT_CHANNEL_ID || 'CDXAKMGTU';
export const DISCUSS_BACKEND_CHANNEL_ID = // #discuss-backend
  process.env.DISCUSS_BACKEND_CHANNEL_ID || 'CUHS29QJ0';
export const DISCUSS_FRONTEND_CHANNEL_ID = // #discuss-frontend
  process.env.DISCUSS_FRONTEND_CHANNEL_ID || 'C8V02RHC7';
export const DISCUSS_ENG_SNS_CHANNEL_ID = // #discuss-eng-sns
  process.env.DISCUSS_FRONTEND_CHANNEL_ID || 'CLTE78L73';
export const DISABLE_GITHUB_METRICS =
  process.env.DISABLE_GITHUB_METRICS === 'true' ||
  process.env.DISABLE_GITHUB_METRICS === '1';
export const DRY_RUN =
  process.env.DRY_RUN === 'true' || process.env.DRY_RUN === '1';
export const PROJECT =
  process.env.ENV === 'production'
    ? 'super-big-data'
    : process.env.DEV_GCP_PROJECT;
export const DATADOG_API_INSTANCE = loadDatadogApiInstance(process.env);

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
export const STALE_LABEL = 'Stale';
export const WORK_IN_PROGRESS_LABEL = 'WIP';
export const WAITING_FOR_LABEL_PREFIX = 'Waiting for: ';
export const WAITING_FOR_SUPPORT_LABEL = 'Waiting for: Support';
export const WAITING_FOR_COMMUNITY_LABEL = 'Waiting for: Community';
export const WAITING_FOR_PRODUCT_OWNER_LABEL = 'Waiting for: Product Owner';
export const MAX_TRIAGE_DAYS = 2;
export const MAX_ROUTE_DAYS = 1;

/**
 * As far as we can tell, it's not possible to check private org membership
 * from an app installation. Therefore, we use a Personal Access Token for a
 * bot account that is itself an org member.
 *
 * If you set FORCE... we will *always* use user auth instead of app
 * installation auth, to make dev life easier.
 */
export const GH_USER_CLIENT = makeUserTokenClient(
  process.env.GH_USER_TOKEN || ''
);
export const FORCE_USER_TOKEN_GITHUB_CLIENT =
  process.env.FORCE_USER_TOKEN_GITHUB_CLIENT === 'true' ||
  process.env.FORCE_USER_TOKEN_GITHUB_CLIENT === '1';

export const GOCD_TOKEN = process.env.GOCD_TOKEN || '';
export const IAP_TARGET_AUDIENCE = process.env.IAP_TARGET_AUDIENCE || '';

/**
 * Load GitHubOrgs. We support processing events coming at us from multiple
 * GitHub orgs and this is how we encapsulate it all.
 *
 * Some of the logic in eng-pipes is meant *only* for the `getsentry` org
 * (things related to CI/CD, mostly), so we want to have a global reference to
 * its GitHubOrg that we can import and use around the codebase. We're fine
 * with failing somewhat opaquely at runtime if it's not configured (at least,
 * that's the status quo). The default org below is intended to accomplish
 * that. We're also fine with trusting that there are no webhook routes
 * pointing at these parts of the codebase by which events from other GitHub
 * orgs could potentially leak into `getsentry`. Eep.
 *
 * Other logic (mostly related to automations for issues and discussions)
 * operates on whatever org--possibly `getsentry`--we find in the payloads from
 * GitHub. For those we use the GH_ORGS registry.
 */
export const GH_ORGS: GitHubOrgs = loadGitHubOrgs(process.env);
export const GETSENTRY_ORG = GH_ORGS.get(
  process.env.GETSENTRY_ORG_SLUG || 'getsentry'
);

// TODO(eng-pipes/issues#610): Clean up this hacky workaround
export const PRODUCT_OWNERS_YML = process.cwd().endsWith('/src')
  ? `../${process.env.PRODUCT_OWNERS_YML || 'product-owners.yml'}`
  : process.env.PRODUCT_OWNERS_YML || 'product-owners.yml';
export const PRODUCT_OWNERS_INFO = yaml.load(
  fs.readFileSync(PRODUCT_OWNERS_YML)
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

export const GOCD_PAUSED_PIPELINE_REMINDERS: GoCDPausedPipelineReminder[] = [
  {
    pipelineName: 'deploy-getsentry-backend-s4s',
    slackChannel: DISCUSS_BACKEND_CHANNEL_ID,
    notifyAfter: moment.duration(1.5, 'hour'),
  },
  {
    pipelineName: 'deploy-getsentry-backend-de',
    slackChannel: DISCUSS_BACKEND_CHANNEL_ID,
    notifyAfter: moment.duration(1.5, 'hour'),
  },
  {
    pipelineName: 'deploy-getsentry-backend-us',
    slackChannel: DISCUSS_BACKEND_CHANNEL_ID,
    notifyAfter: moment.duration(1.5, 'hour'),
  },
];

/**
 * Webhook secrets
 */
export const SENTRY_OPTIONS_WEBHOOK_SECRET =
  process.env.SENTRY_OPTIONS_WEBHOOK_SECRET;
export const GOCD_WEBHOOK_SECRET = process.env.GOCD_WEBHOOK_SECRET;
export const KAFKA_CONTROL_PLANE_WEBHOOK_SECRET =
  process.env.KAFKA_CONTROL_PLANE_WEBHOOK_SECRET;

/**
 * Regex
 */
export const SHA256_REGEX = /^[A-Fa-f0-9]{64}$/;

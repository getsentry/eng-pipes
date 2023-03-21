import { IncomingMessage, Server, ServerResponse } from 'http';

import { Octokit } from '@octokit/rest';
import { GetResponseDataTypeFromEndpointMethod } from '@octokit/types';
import { EmitterWebhookEvent } from '@octokit/webhooks';
import { FastifyInstance } from 'fastify';

// e.g. the return type of `buildServer`
export type Fastify = FastifyInstance<Server, IncomingMessage, ServerResponse>;

/**
 * GitHub types
 */
const octokit = new Octokit();

export type Issue = GetResponseDataTypeFromEndpointMethod<
  typeof octokit.issues.get
>;

export type CompareCommits = GetResponseDataTypeFromEndpointMethod<
  typeof octokit.repos.compareCommits
>;

export type ReposGetCommit = GetResponseDataTypeFromEndpointMethod<
  typeof octokit.repos.getCommit
>;
export type Annotation = GetResponseDataTypeFromEndpointMethod<
  typeof octokit.checks.listAnnotations
>[number];

export type CheckRun = EmitterWebhookEvent<'check_run'>['payload']['check_run'];

// Note we intentionally only pick the pieces of checkRun that is needed to
// construct a message in "requiredChecks", as we want to minimize the
// properties to save to database
//
// Need to do this as we can't convert a string literal union to an array of literals
export const CHECK_RUN_PROPERTIES = ['id', 'head_sha', 'html_url'] as const;
export type CheckRunProperty = typeof CHECK_RUN_PROPERTIES[number];
export type CheckRunForRequiredChecksText = Pick<CheckRun, CheckRunProperty>;

type TravisRepository = {
  id: number;
  name: string;
  owner_name: string;
  url: string | null;
};

type TravisEventType = 'push' | 'pull_request' | 'cron' | 'api';

/**
 * 0: Represents a build that has completed successfully
 * 1: Represents a build that has not yet completed or has completed and failed
 */
type TravisStatus = 0 | 1;
type TravisResult = TravisStatus;

/**
 * State of the build
 */
type TravisState =
  | 'passed'
  | 'pending'
  | 'fixed'
  | 'broken'
  | 'failed'
  | 'canceled'
  | 'errored';

type TravisConfig = any;

type TravisMatrix = {
  id: number;
  repository_id: TravisRepository['id'];
  parent_id: TravisPayload['id'];
  /**
   * Travis build number
   * e.g. 173.5
   */
  number: string;
  state: TravisState;
  config: TravisConfig;
  status: TravisStatus;
  result: TravisResult;
  commit: string;
  branch: string;
  message: string;
  compare_url: string;
  started_at: string;
  finished_at: string | null;
  committed_at: string;
  author_name: string;
  author_email: string;
  committer_name: string;
  committer_email: string;
  allow_failure: boolean | null;
};

export type TravisPayload = {
  id: number;
  /**
   * Pull Request Number
   */
  number: string;

  type: TravisEventType;
  state: TravisState;
  status: TravisStatus;
  result: TravisStatus;
  status_message: string;
  result_message: string;
  started_at: string;
  finished_at: string;
  duration: number;
  build_url: string;
  commit_id: number;

  /**
   * Full commit sha
   */
  commit: string;
  /**
   * i.e. commit sha of master
   * 704b6b8cae9023275785f8a752025d117e788f38
   */
  base_commit: string;
  /**
   * i.e. PR's head commit
   * e2fb88b6df64a87c2cc78256a50a1e0fe1fbefd2
   */

  head_commit: string;

  /**
   * I think this is the target branch to merge into...
   */
  branch: string;
  /**
   * Commit message
   */
  message: string;

  /**
   * e.g. https://github.com/billyvg/sentry/pull/11
   */
  compare_url: string;
  committed_at: string;
  author_name: string;
  author_email: string;
  committer_name: string;
  committer_email: string;
  pull_request: boolean;
  pull_request_number: number | null;
  pull_request_title: number | null;
  tag: string | null;
  repository: TravisRepository;
  matrix: TravisMatrix[];
  config: TravisConfig;
};

export type FreightStatus =
  | 'queued'
  | 'started'
  | 'failed'
  | 'canceled'
  | 'finished';

export interface FreightPayload {
  app_name: string;
  date_created: string;
  date_started: string | null;
  date_finished: string | null;
  deploy_number: number;
  duration: number | null;
  environment: string;
  link: string;
  params: Record<string, any>;
  previous_sha: string;
  ref: string;
  sha: string;
  status: string;
  title: string;
  user: string;
  user_id: number;
}

export type GoCDResponse = GoCDStageResponse | GoCDAgentResponse;

export interface GoCDStageResponse {
  type: 'stage';
  data: GoCDStageData;
}

export interface GoCDAgentResponse {
  type: 'agent';
  data: any;
}

export interface GoCDStageData {
  pipeline: GoCDPipeline;
}

export interface GoCDPipeline {
  name: string;
  counter: string;
  group: string;
  'build-cause': Array<GoCDBuildCause>;
  stage: GoCDStage;
}

export interface GoCDStage {
  name: string;
  counter: string;
  'approval-type': GoCDApprovalType;
  'approved-by': string;
  state: GoCDStateType;
  result: GoCDResultType;
  'create-time': string;
  'last-transition-time': string;
  jobs: Array<GoCDJob>;
}

interface GoCDJob {
  name: string;
  'schedule-time': string;
  'assign-time': string;
  'complete-time': string;
  state: GoCDJobState;
  result: GoCDJobResult;
  'agent-uuid': string | null;
}

export interface GoCDBuildCause {
  material: {
    'git-configuration': GoCDGitConfiguration;
    type: string;
  };
  changed: boolean;
  modifications: Array<GoCDModification>;
}

interface GoCDModification {
  revision: string;
  'modified-time': string;
}

interface GoCDGitConfiguration {
  'shallow-clone': boolean;
  branch: string;
  url: string;
}

export interface GoCDBuildMaterial {
  stage_material_id: string;
  pipeline_id: string;
  url: string;
  branch: string;
  revision: string;
}

type GoCDJobResult = 'Unknown' | 'Passed';

type GoCDJobState = 'Scheduled' | 'Completed';

type GoCDApprovalType = 'success' | 'manual';

type GoCDResultType = 'Passed' | 'Failed' | 'Cancelled' | 'Unknown';

type GoCDStateType = 'Passed' | 'Failed' | 'Cancelled' | 'Building';

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

export interface AppAuthStrategyOptions {
  appId: number;
  privateKey: string;
  installationId: number;
}

export interface GitHubIssuesSomeoneElseCaresAbout {
  nodeId: string;
  fieldIds: {
    productArea: string;
    status: string;
    responseDue: string;
  };
}

export interface GitHubOrgConfig {
  slug: any;
  appAuth: any;
  project: any;
  repos: any;
}

export interface GitHubOrgRepos {
  all: string[];
  withRouting: string[];
  withoutRouting: string[];
}

export type CheckRun = EmitterWebhookEvent<'check_run'>['payload']['check_run'];

// Note we intentionally only pick the pieces of checkRun that is needed to
// construct a message in "requiredChecks", as we want to minimize the
// properties to save to database
//
// Need to do this as we can't convert a string literal union to an array of literals
export const CHECK_RUN_PROPERTIES = ['id', 'head_sha', 'html_url'] as const;
export type CheckRunProperty = typeof CHECK_RUN_PROPERTIES[number];
export type CheckRunForRequiredChecksText = Pick<CheckRun, CheckRunProperty>;

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
    type: GoCDBuildType;
  };
  changed: boolean;
  modifications: Array<GoCDModification>;
}

export interface GoCDModification {
  revision: string;
  'modified-time': string;
}

interface GoCDGitConfiguration {
  'shallow-clone': boolean;
  branch: string;
  url: string;
}

export interface DBGoCDBuildMaterial {
  stage_material_id: string;
  pipeline_id: string;
  url: string;
  branch: string;
  revision: string;
}

export interface DBGoCDDeployment {
  pipeline_id: string;

  pipeline_name: string;
  pipeline_counter: string;
  pipeline_group: string;
  pipeline_build_cause: Array<GoCDBuildCause>;

  stage_name: string;
  stage_counter: string;
  stage_approval_type: string;
  stage_approved_by: string;
  stage_state: string;
  stage_result: string;
  stage_create_time: string;
  stage_last_transition_time: string;
  stage_jobs: Array<GoCDJob>;
}

type GoCDJobResult = 'Unknown' | 'Passed';

type GoCDJobState = 'Scheduled' | 'Completed';

type GoCDApprovalType = 'success' | 'manual';

type GoCDResultType = 'Passed' | 'Failed' | 'Cancelled' | 'Unknown';

type GoCDStateType = 'Passed' | 'Failed' | 'Cancelled' | 'Building';

export type GoCDBuildType = 'git' | 'pipeline';

export type DashboardPipelinePauseInfo = {
  paused: boolean;
  paused_by: string | null;
  pause_reason: string | null;
  paused_at: string | null;
};

export type DashboardPipeline = {
  name: string;
  last_updated_timestamp: number;
  locked: boolean;
  pause_info?: DashboardPipelinePauseInfo;
  can_operate: boolean;
  can_administer: boolean;
  can_unlock: boolean;
  can_pause: boolean;
  from_config_repo: boolean;
  instances: DashboardPipelineInstance[];
};

export type DashboardPipelineStage = {
  name: string;
  counter: number;
  status: string;
  approved_by: string;
  scheduled_at: string;
};

export type DashboardPipelineInstance = {
  label: string;
  counter: number;
  triggered_by: string;
  scheduled_at: number;
  stages: DashboardPipelineStage[];
};

export type PipelineGroup = {
  name: string;
  pipelines: string[];
  // TODO: add the rest of the fields
};

export type GoCDDashboardResponse = {
  pipeline_groups: PipelineGroup[];
  pipelines: DashboardPipeline[];
};

export type GoCDPausedPipelineReminder = {
  pipelineName: string;
  slackChannel: string;
  notifyAfter: moment.Duration;
};

export interface SentryOptionsResponse {
  region: string;
  source: string;
  drifted_options: { option_name: string; option_value: string }[];
  updated_options: { option_name: string; db_value: string; value: string }[];
  set_options: { option_name: string; option_value: string }[];
  unset_options: string[];
  not_writable_options: { option_name: string; error_msg: string }[];
  unregistered_options: string[];
  invalid_type_options: {
    option_name: string;
    got_type: string;
    expected_type: string;
  }[];
}

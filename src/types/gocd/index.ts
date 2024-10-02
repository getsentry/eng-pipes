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

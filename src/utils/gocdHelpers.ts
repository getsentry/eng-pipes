import { getLastGetSentryGoCDDeploy } from './db/getLatestDeploy';

import {
  Color,
  GOCD_SENTRYIO_BE_PIPELINE_NAME,
  GOCD_SENTRYIO_FE_PIPELINE_NAME,
} from '~/src/config';
import {
  DBGoCDDeployment,
  GoCDBuildCause,
  GoCDBuildType,
  GoCDPipeline,
} from '~/src/types';

export const INPROGRESS_MSG = 'is being deployed';
const DEPLOYED_MSG = 'was deployed';
export const FAILED_MSG = 'failed to deploy';
const CANCELLED_MSG = 'was cancelled';
export const SUCCESSFUL_MSG = 'was successful';
export const READY_TO_DEPLOY = 'is ready to deploy';

export const ALL_MESSAGE_SUFFIX = [
  INPROGRESS_MSG,
  DEPLOYED_MSG,
  FAILED_MSG,
  CANCELLED_MSG,
  SUCCESSFUL_MSG,
  READY_TO_DEPLOY,
];

// GoCD does not provide details about all pipeline stages, so we can't
// know if a GoCD notification is the last stage in the pipeline or not.
// We use these names to determine if the deployment is complete or not.
export const FINAL_STAGE_NAMES = [
  'deploy',
  'deploy-primary',
  'pipeline-complete',
];
const GETSENTRY_PIPELINES = [
  GOCD_SENTRYIO_BE_PIPELINE_NAME,
  GOCD_SENTRYIO_FE_PIPELINE_NAME,
];

export function getProgressSuffix(pipeline: GoCDPipeline) {
  const stage = pipeline.stage;
  switch (stage.result.toLowerCase()) {
    case 'passed':
      // We give getsentry and sentry pipelines special treatment as these
      // pipelines send messages directly to users.
      if (GETSENTRY_PIPELINES.includes(pipeline.name)) {
        // If the final stage has passed, return the deployed message
        if (FINAL_STAGE_NAMES.includes(stage.name)) {
          return DEPLOYED_MSG;
        } else {
          return INPROGRESS_MSG;
        }
      }
      return SUCCESSFUL_MSG;
    case 'failed':
      return FAILED_MSG;
    case 'cancelled':
      return CANCELLED_MSG;
    case 'unknown':
      return INPROGRESS_MSG;
    default:
      return '';
  }
}

export function getProgressColor(pipeline: GoCDPipeline) {
  const stage = pipeline.stage;
  switch (stage.result.toLowerCase()) {
    case 'passed':
      // We give getsentry and sentry pipelines special treatment as these
      // pipelines send messages directly to users.
      if (GETSENTRY_PIPELINES.includes(pipeline.name)) {
        // If the final stage has passed, return the success color
        if (FINAL_STAGE_NAMES.includes(stage.name)) {
          return Color.SUCCESS;
        } else {
          return Color.OFF_WHITE_TOO;
        }
      }
      return Color.SUCCESS;
    case 'unknown':
      return Color.OFF_WHITE_TOO;
    default:
      return Color.DANGER;
  }
}

export function firstGitMaterialSHA(
  deploy: DBGoCDDeployment | undefined
): string | null {
  if (!deploy) {
    return null;
  }
  if (deploy.pipeline_build_cause.length === 0) {
    return null;
  }
  for (const bc of deploy.pipeline_build_cause) {
    if (!bc.material || bc.material.type !== 'git') {
      continue;
    }
    if (bc.modifications.length === 0) {
      continue;
    }
    return bc.modifications[0].revision;
  }
  return null;
}

export function filterBuildCauses(
  pipeline: GoCDPipeline,
  type: GoCDBuildType
): Array<GoCDBuildCause> {
  const buildCauses = pipeline['build-cause'];
  if (!buildCauses || buildCauses.length === 0) {
    return [];
  }

  const filteredCauses: Array<GoCDBuildCause> = [];
  for (const bc of buildCauses) {
    if (
      !bc.material ||
      bc.material.type !== type ||
      bc.modifications.length === 0
    ) {
      continue;
    }
    filteredCauses.push(bc);
  }
  return filteredCauses;
}

export async function getBaseAndHeadCommit(
  pipeline: GoCDPipeline
): Promise<[string | null, string | null]> {
  const buildCauses = filterBuildCauses(pipeline, 'git');
  if (buildCauses.length === 0) {
    return [null, null];
  }

  const latestBuildCause = buildCauses[0];
  const latestModification = latestBuildCause.modifications[0];

  const latestDeploy = await getLastGetSentryGoCDDeploy(
    pipeline.group,
    pipeline.name
  );
  if (!latestDeploy) {
    return [null, latestModification.revision];
  }

  const latestSha = firstGitMaterialSHA(latestDeploy);
  if (!latestSha) {
    return [null, latestModification.revision];
  }

  return [latestSha, latestModification.revision];
}

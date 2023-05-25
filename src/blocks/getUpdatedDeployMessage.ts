import { GOCD_ORIGIN } from '@/config';
import { FINAL_STAGE_NAMES } from '@/utils/gocdHelpers';

function getSubject(isUserDeploying, slackUser) {
  if (isUserDeploying) {
    return 'You have';
  }
  return `${slackUser} has`;
}

export function getUpdatedGoCDDeployMessage({
  isUserDeploying,
  slackUser,
  pipeline,
}: {
  isUserDeploying: boolean;
  slackUser: string | undefined;
  pipeline: {
    pipeline_name: string;
    pipeline_counter: number;
    stage_name: string;
    stage_counter: number;
    stage_state: string;
  };
}) {
  const subject = getSubject(isUserDeploying, slackUser);

  const link = `${GOCD_ORIGIN}/go/pipelines/${pipeline.pipeline_name}/${pipeline.pipeline_counter}/${pipeline.stage_name}/${pipeline.stage_counter}`;
  const slackLink = `<${link}|${pipeline.pipeline_name}: Stage ${[
    pipeline.stage_counter,
  ]}>`;

  const state = pipeline.stage_state.toLowerCase();
  switch (state) {
    case 'building':
      if (pipeline.stage_counter > 1) {
        return `${subject} begun deploying this commit (${slackLink})`;
      } else {
        return `${subject} queued this commit for deployment (${slackLink})`;
      }
    case 'passed':
      if (FINAL_STAGE_NAMES.indexOf(pipeline.stage_name) !== -1) {
        return `${subject} finished deploying this commit (${slackLink})`;
      }
      return `${subject} begun deploying this commit (${slackLink})`;
    default:
      // Otherwise it failed to deploy.
      return `${subject} failed to deploy this commit (${slackLink})`;
  }
}

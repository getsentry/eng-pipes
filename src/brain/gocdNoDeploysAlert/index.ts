import { KnownBlock } from '@slack/types';

import { gocdevents } from '@/api/gocdevents';
import { bolt } from '@/api/slack';
import * as slackblocks from '@/blocks/slackBlocks';
import {
  FEED_DEV_INFRA_CHANNEL_ID,
  GOCD_ORIGIN,
  GOCD_SENTRYIO_BE_PIPELINE_NAME,
  GOCD_SENTRYIO_FE_PIPELINE_NAME,
} from '@/config';
import {
  DBGoCDDeployment,
  GoCDPipeline,
  GoCDResponse,
  GoCDStageResponse,
} from '@/types';
import { getLastGetSentryGoCDDeploy } from '@/utils/db/getLatestDeploy';

const PIPELINE_FILTER = [
  GOCD_SENTRYIO_BE_PIPELINE_NAME,
  GOCD_SENTRYIO_FE_PIPELINE_NAME,
];
const DEPLOYS_FAILING_HOURS = 2;
export const DEPLOYS_FAILING_LIMIT_MS = DEPLOYS_FAILING_HOURS * 60 * 60 * 1000;

function getBodyText(pipeline: GoCDPipeline) {
  return `🆘 *${pipeline.name}* has not deployed in *over ${DEPLOYS_FAILING_HOURS} hours*.`;
}

function getMessageBlocks(
  pipeline: GoCDPipeline,
  lastDeploy: DBGoCDDeployment
): Array<KnownBlock> {
  const prevDeployVSMURL = `${GOCD_ORIGIN}/go/pipelines/value_stream_map/${lastDeploy.pipeline_name}/${lastDeploy.pipeline_counter}`;
  const currentOverviewURL = `${GOCD_ORIGIN}/go/pipelines/${pipeline.name}/${pipeline.counter}/${pipeline.stage.name}/${pipeline.stage.counter}`;
  const deployToolsURL = `https://deploy-tools.getsentry.net/services/${pipeline.group}`;

  return [
    slackblocks.section(slackblocks.markdown(getBodyText(pipeline))),
    slackblocks.section(
      slackblocks.markdown(
        `<${currentOverviewURL}|Latest failure> | <${prevDeployVSMURL}|Last good deploy> | <${deployToolsURL}|Deploy Tools>`
      )
    ),
  ];
}

export async function handler(body: GoCDResponse) {
  const { pipeline } = (body as GoCDStageResponse).data;
  if (!PIPELINE_FILTER.includes(pipeline.name)) {
    return;
  }

  // If everything is passing, we don't need to check or do anything
  if (pipeline.stage.result.toLowerCase() !== 'failed') {
    return;
  }

  const lastDeploy = await getLastGetSentryGoCDDeploy(
    pipeline.group,
    pipeline.name
  );
  if (!lastDeploy) {
    // Do nothing until we have at least one deploy
    return;
  }

  const date = new Date(lastDeploy.stage_last_transition_time);
  if (Date.now() - DEPLOYS_FAILING_LIMIT_MS < date.getTime()) {
    return;
  }

  await bolt.client.chat.postMessage({
    text: getBodyText(pipeline),
    channel: FEED_DEV_INFRA_CHANNEL_ID,
    blocks: getMessageBlocks(pipeline, lastDeploy),
    unfurl_links: false,
  });
}

export async function gocdNoDeploysAlert() {
  gocdevents.on('stage', handler);
}

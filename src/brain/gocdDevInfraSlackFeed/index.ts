import * as Sentry from '@sentry/node';

import { GoCDPipeline, GoCDResponse } from '@types';

import { gocdevents } from '@/api/gocdevents';
import {
  FEED_DEV_PROD_CHANNEL_ID,
  GOCD_ORIGIN,
  GOCD_SENTRYIO_BE_PIPELINE_NAME,
  GOCD_SENTRYIO_FE_PIPELINE_NAME,
} from '@/config';
import { SlackMessage } from '@/config/slackMessage';
import { getProgressColor, getProgressSuffix } from '@/utils/gocdHelpers';
import { bolt } from '@api/slack';
import { getSlackMessage } from '@utils/db/getSlackMessage';
import { saveSlackMessage } from '@utils/db/saveSlackMessage';

const PIPELINE_FILTER = [
  GOCD_SENTRYIO_BE_PIPELINE_NAME,
  GOCD_SENTRYIO_FE_PIPELINE_NAME,
];

function getMessageAttachments(pipeline) {
  const progressText = getProgressSuffix(pipeline);
  if (!progressText) {
    return;
  }

  const progressColor = getProgressColor(pipeline);
  const overviewURL = `${GOCD_ORIGIN}/go/pipelines/${pipeline.name}/${pipeline.counter}/${pipeline.stage.name}/${pipeline.stage.counter}`;
  const logsURL = `${GOCD_ORIGIN}/go/tab/build/detail/${pipeline.name}/${
    pipeline.counter
  }/${pipeline.stage.name}/${pipeline.stage.counter}/${
    pipeline.stage.jobs[pipeline.stage.jobs.length - 1].name
  }`;

  return [
    {
      color: progressColor,
      author_name: `${pipeline.group}/${pipeline.name}`,
      text: `step "${pipeline.stage.name}" <${overviewURL}|${progressText}>`,
      footer: `<${logsURL}|Job Logs>`,
    },
  ];
}

async function newSlackMessage(refId, pipeline: GoCDPipeline) {
  // We only really care about creating new messages if the pipeline has
  // failed.
  if (pipeline.stage.result.toLowerCase() !== 'failed') {
    return;
  }

  const attachments = getMessageAttachments(pipeline);
  if (!attachments) {
    return;
  }

  const body = 'GoCD deployment';
  const message = await bolt.client.chat.postMessage({
    text: body,
    channel: FEED_DEV_PROD_CHANNEL_ID,
    attachments: attachments,
  });

  await saveSlackMessage(
    SlackMessage.FEED_DEV_PROD_GOCD_DEPLOY,
    {
      refId,
      channel: `${message.channel}`,
      ts: `${message.ts}`,
    },
    {
      text: body,
    }
  );
}

async function updateSlackMessage(message: any, pipeline: GoCDPipeline) {
  await bolt.client.chat.update({
    ts: message.ts,
    channel: FEED_DEV_PROD_CHANNEL_ID,
    // NOTE: Using the message context means the message text contains
    // who initiated the deployment (either manual or an auto-deployment).
    text: message.context.text,
    attachments: getMessageAttachments(pipeline),
  });
}

function getPipelineId(pipeline: GoCDPipeline) {
  let refId = `${pipeline.group}-${pipeline.name}/${pipeline.counter}`;
  if (pipeline['build-cause']) {
    const bc = pipeline['build-cause'][0];
    if (bc.modifications) {
      const m = bc.modifications[0];
      refId += `@${m.revision}`;
    }
  }
  return refId;
}

async function postUpdateToSlack(pipeline: GoCDPipeline): Promise<void> {
  // Only notify on the getsentry frontend / backend
  // pipelines.
  if (PIPELINE_FILTER.includes(pipeline.name)) {
    return;
  }

  const refId = getPipelineId(pipeline);

  // Look for associated slack messages based on pipeline
  const messages = await getSlackMessage(
    SlackMessage.FEED_DEV_PROD_GOCD_DEPLOY,
    [refId]
  );

  if (!messages.length) {
    await newSlackMessage(refId, pipeline);
  } else {
    messages.forEach(async (message) => {
      await updateSlackMessage(message, pipeline);
    });
  }
}

/**
 * This handler listens to GoCD stage events and posts a start and end
 * message to feed-eng.
 *
 * (Exported for tests)
 */
export async function handler(resBody: GoCDResponse) {
  const { pipeline } = resBody.data;

  try {
    await postUpdateToSlack(pipeline);
  } catch (err) {
    Sentry.captureException(err);
    console.error(err);
  }
}

export async function gocdDevInfraSlackFeed() {
  gocdevents.on('stage', handler);
}

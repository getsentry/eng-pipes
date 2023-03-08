import * as Sentry from '@sentry/node';

import { GoCDPipeline, GoCDResponse } from '@types';

import { gocdevents } from '@/api/gocdevents';
import { FEED_ENG_CHANNEL_ID, GOCD_ORIGIN } from '@/config';
import { SlackMessage } from '@/config/slackMessage';
import { getProgressColor, getProgressSuffix } from '@/utils/gocdHelpers';
import { getUser } from '@api/getUser';
import { bolt } from '@api/slack';
import { getSlackMessage } from '@utils/db/getSlackMessage';
import { saveSlackMessage } from '@utils/db/saveSlackMessage';

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

async function getBodyText(pipeline: GoCDPipeline) {
  let body = `GoCD deployment started`;
  const approvedBy = pipeline.stage['approved-by'];
  if (approvedBy) {
    // We check for "changes" since `getUser() can return an email
    // for this even though it may not match.
    if (approvedBy == 'changes') {
      body = `GoCD auto-deployment started`;
    } else {
      const user = await getUser({ email: approvedBy });
      if (user?.slackUser) {
        body = `GoCD deployment started by <@${user.slackUser}>`;
      }
    }
  }
  return body;
}

async function newSlackMessage(refId, pipeline: GoCDPipeline) {
  const attachments = getMessageAttachments(pipeline);
  if (!attachments) {
    return;
  }

  const body = await getBodyText(pipeline);
  const message = await bolt.client.chat.postMessage({
    text: body,
    channel: FEED_ENG_CHANNEL_ID,
    attachments: attachments,
  });

  await saveSlackMessage(
    SlackMessage.FEED_ENG_DEPLOY,
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
    channel: FEED_ENG_CHANNEL_ID,
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
  const refId = getPipelineId(pipeline);

  // Look for associated slack messages based on pipeline
  const messages = await getSlackMessage(SlackMessage.FEED_ENG_DEPLOY, [refId]);

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

  const tx = Sentry.startTransaction({
    op: 'brain',
    name: 'gocdSlackFeed',
  });
  Sentry.configureScope((scope) => scope.setSpan(tx));

  try {
    await postUpdateToSlack(pipeline);
  } catch (err) {
    Sentry.captureException(err);
    console.error(err);
  }

  tx.finish();
}

export async function gocdSlackFeed() {
  gocdevents.on('stage', handler);
}

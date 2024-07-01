import * as Sentry from '@sentry/node';
import moment from 'moment-timezone';

import { GitHubOrg } from '@/api/github/org';
import { fetchDashboard } from '@/api/gocd';
import { bolt } from '@/api/slack';
import {
  GETSENTRY_ORG,
  GOCD_ORIGIN,
  GOCD_PAUSED_PIPELINE_REMINDERS,
} from '@/config';
import { GoCDDashboardResponse } from '@/types';

const GOCD_PAUSED_PIPELINE_REMINDER_TEXT_SINGULAR =
  'A pipeline has been paused for an extended period of time. If this is unintentional, please look into unpausing it if it is safe to do so.';
const GOCD_PAUSED_PIPELINE_REMINDER_TEXT_PLURAL =
  'Multiple pipelines have been paused for an extended period of time. If this is unintentional, please look into unpausing them if it is safe to do so.';

type PausedPipelineInfo = {
  pipelineName: string;
  durationPaused: moment.Duration;
};

export const triggerPausedPipelineBot = async (
  org: GitHubOrg,
  now: moment.Moment
) => {
  if (org !== GETSENTRY_ORG) {
    return;
  }
  let dashboardResult: GoCDDashboardResponse;
  try {
    dashboardResult = await fetchDashboard();
  } catch (err) {
    Sentry.captureException(err);
    return;
  }
  const remindersByChannel = getRemindersByChannel(dashboardResult, now);
  for (const [channel, pausedPipelineInfos] of remindersByChannel.entries()) {
    const pausedPipelineReminderText = getReminderText(pausedPipelineInfos);
    await postMessageToSlack(
      channel,
      pausedPipelineReminderText,
      pausedPipelineInfos
    );
  }
};

function getRemindersByChannel(
  dashboardResult: GoCDDashboardResponse,
  now: moment.Moment
): Map<string, PausedPipelineInfo[]> {
  const remindersByChannel = new Map<string, PausedPipelineInfo[]>();
  for (const pipeline of dashboardResult.pipelines) {
    const pauseInfo = pipeline.pause_info;
    const pausedPipelineReminder = GOCD_PAUSED_PIPELINE_REMINDERS.find(
      (reminder) => reminder.pipelineName === pipeline.name
    );
    if (
      pausedPipelineReminder === undefined ||
      pauseInfo === undefined ||
      !pauseInfo.paused ||
      pauseInfo.paused_at == null
    ) {
      continue;
    }
    const durationPaused = moment.duration(now.diff(pauseInfo.paused_at));
    if (durationPaused >= pausedPipelineReminder.notifyAfter) {
      const pausedPipelineInfos =
        remindersByChannel.get(pausedPipelineReminder.slackChannel) ?? [];
      pausedPipelineInfos.push({
        pipelineName: pipeline.name,
        durationPaused,
      });
      remindersByChannel.set(
        pausedPipelineReminder.slackChannel,
        pausedPipelineInfos
      );
    }
  }
  return remindersByChannel;
}

async function postMessageToSlack(
  channel: string,
  pausedPipelineReminderText: string,
  pausedPipelineInfos: PausedPipelineInfo[]
) {
  const pausedPipelineReminderBlocks = generatePausedPipelineReminderBlocks(
    pausedPipelineReminderText,
    pausedPipelineInfos
  );
  await bolt.client.chat.postMessage({
    channel,
    text: pausedPipelineReminderText,
    blocks: pausedPipelineReminderBlocks,
  });
}

function generatePausedPipelineReminderBlocks(
  pausedPipelineReminderText: string,
  pausedPipelines: PausedPipelineInfo[]
) {
  const pausedPipelineWarningTexts = pausedPipelines
    .map((info) => {
      return `:warning: *<${GOCD_ORIGIN}/go/tab/pipeline/history/${
        info.pipelineName
      }|${
        info.pipelineName
      }>*: has been paused for ${info.durationPaused.humanize()}`;
    })
    .join('\n');
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: pausedPipelineReminderText,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: pausedPipelineWarningTexts,
      },
    },
  ];
}

function getReminderText(pausedPipelinesInfos: PausedPipelineInfo[]): string {
  return pausedPipelinesInfos.length > 1
    ? GOCD_PAUSED_PIPELINE_REMINDER_TEXT_PLURAL
    : GOCD_PAUSED_PIPELINE_REMINDER_TEXT_SINGULAR;
}

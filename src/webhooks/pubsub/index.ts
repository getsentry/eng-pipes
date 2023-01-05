import { Octokit } from '@octokit/rest';
import * as Sentry from '@sentry/node';
import { FastifyReply, FastifyRequest } from 'fastify';
import moment from 'moment-timezone';
import { db } from '@utils/db';

import { ClientType } from '@/api/github/clientType';
import { getLabelsTable } from '@/brain/issueNotifier';
import {
  OWNER,
  SENTRY_REPO,
  TEAM_LABEL_PREFIX,
  UNTRIAGED_LABEL,
} from '@/config';
import { Issue } from '@/types';
import { getClient } from '@api/github/getClient';
import { bolt } from '@api/slack';
import { isChannelInBusinessHours } from '@/utils/businessHours';

const DEFAULT_REPOS = [SENTRY_REPO];
const GH_API_PER_PAGE = 100;
const DEFAULT_TEAM_LABEL = 'Team: Open Source';
const getChannelLastNotifiedTable = () => db('channel_last_notified');


type PubSubPayload = {
  name: string;
  slo?: number;
  repos?: string[];
};

type IssueSLOInfo = {
  url: string;
  number: number;
  title: string;
  teamLabel: string;
  triageBy: string;
};

type SlackMessageBlocks = {
  type: string;
  text?: object;
  fields?: object;
};

export const opts = {
  schema: {
    body: {
      type: 'object',
      required: ['message'],
      properties: {
        message: {
          type: 'object',
          required: ['data'],
          properties: {
            data: {
              type: 'string',
            },
          },
        },
      },
    },
  },
};

const getLabelName = (label?: Issue['labels'][number]) =>
  typeof label === 'string' ? label : label?.name || '';

const getIssueTeamLabel = (issue: Issue) => {
  const label = issue.labels.find((label) =>
    getLabelName(label).startsWith(TEAM_LABEL_PREFIX)
  );
  return getLabelName(label) || DEFAULT_TEAM_LABEL;
};

export const getTriageSLOTimestamp = async (
  octokit: Octokit,
  repo: string,
  issue_number: number
) => {
  const issues = await octokit.paginate(octokit.issues.listComments, {
    owner: OWNER,
    repo,
    issue_number,
    per_page: GH_API_PER_PAGE,
  });

  const routingEvents = issues.filter(
    (event) =>
      // @ts-ignore - We _know_ a `label` property exists on `labeled` events
      event.user.type === 'Bot'
  );
  const lastRouteComment = routingEvents[routingEvents.length - 1];
  // use regex to parse the timestamp from the bot comment
  const parseBodyForDatetime = lastRouteComment?.body?.match(
    /<time datetime=(?<timestamp>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z)>/
  )?.groups;
  if (!parseBodyForDatetime?.timestamp) {
    // Throw an exception if we have trouble parsing the timestamp
    Sentry.captureException(
      new Error(
        `Could not parse timestamp from comments for ${repo}/issues/${issue_number}`
      )
    );
    return moment().toISOString();
  }
  return parseBodyForDatetime.timestamp;
};

export const constructSlackMessage = (
  notificationChannels: Record<string, string[]>,
  teamToIssuesMap: Record<string, IssueSLOInfo[]>,
  now: moment.Moment
) => {
  return Object.keys(notificationChannels).flatMap(async (channelId) => {
    // Group issues into buckets based on time left until SLA
    const overdueIssues: {
      text: string;
      timeRemaining: string;
      number: number;
    } = {
      text: '',
      timeRemaining: '',
      number: 1,
    };
    const actFastIssues: {
      text: string;
      timeRemaining: string;
      number: number;
    } = {
      text: '',
      timeRemaining: '',
      number: 1,
    };
    const triageQueueIssues: {
      text: string;
      timeRemaining: string;
      number: number;
    } = {
      text: '',
      timeRemaining: '',
      number: 1,
    };
    if(await isChannelInBusinessHours(channelId, now)) {
      notificationChannels[channelId].map((team) => {
        teamToIssuesMap[team].forEach(({ url, number, title, triageBy }) => {
          const hoursLeft = now.diff(triageBy, 'hours') * -1;
          const minutesLeft = now.diff(triageBy, 'minutes') * -1 - hoursLeft * 60;
          if (hoursLeft <= 0 && minutesLeft <= 0) {
            overdueIssues.text += `\n${overdueIssues.number}. <${url}|#${number} ${title}>`;
            overdueIssues.timeRemaining += `\n${hoursLeft * -1} hours ${
              minutesLeft * -1
            } minutes overdue`;
            overdueIssues.number += 1;
          } else if (hoursLeft <= 4) {
            actFastIssues.text += `\n${actFastIssues.number}. <${url}|#${number} ${title}>`;
            actFastIssues.timeRemaining += `\n${hoursLeft} hours ${minutesLeft} minutes left`;
            actFastIssues.number += 1;
          } else {
            triageQueueIssues.text += `\n${triageQueueIssues.number}. <${url}|#${number} ${title}>`;
            triageQueueIssues.timeRemaining += `\n${hoursLeft} hours ${minutesLeft} minutes left`;
            triageQueueIssues.number += 1;
          }
        });
      });
      const messageBlocks: SlackMessageBlocks[] = [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: 'Hey! You have some tickets to triage:',
          },
        },
      ];
      if (overdueIssues.text) {
        messageBlocks.push({
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `🚨 *Overdue*\n${overdueIssues.text}` },
            { type: 'mrkdwn', text: `😰\n${overdueIssues.timeRemaining}` },
          ],
        });
      }
      if (actFastIssues.text) {
        messageBlocks.push({
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `⌛️ *Act fast!*\n${actFastIssues.text}`,
            },
            { type: 'mrkdwn', text: `😨\n${actFastIssues.timeRemaining}` },
          ],
        });
      }
      const result = await getChannelLastNotifiedTable().where({ channel_id: channelId }).select('last_notified_at');
      const shouldNotifyForOnlyTriagedQueue = result.length > 0 ? now.diff(result[0], "hours") < 4 : true
      if (triageQueueIssues.text) {
        messageBlocks.push({
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `⏳ *Triage Queue*\n${triageQueueIssues.text}`,
            },
            { type: 'mrkdwn', text: `😯\n${triageQueueIssues.timeRemaining}` },
          ],
        });
      }
      if (messageBlocks.length === 1 ||
        messageBlocks.length === 2 && triageQueueIssues.number > 1 && !shouldNotifyForOnlyTriagedQueue) {
        return Promise.resolve();
      }
      return bolt.client.chat.postMessage({
        channel: channelId,
        text: '👋 Triage Reminder ⏰',
        blocks: messageBlocks,
      }).then(async () => {
        await getChannelLastNotifiedTable().insert({ channel_id: channelId, last_notified_at: now }).onConflict("channel_id").merge();
      });
    }
    return Promise.resolve();
  });
};

export const notifyTeamsForUntriagedIssues = async (
  request: FastifyRequest<{ Body: { message: { data: string } } }>,
  reply: FastifyReply
) => {
  const tx = Sentry.startTransaction({
    op: 'webhooks',
    name: 'pubsub.notifyForUntriagedIssues',
  });
  const payload: PubSubPayload = JSON.parse(
    Buffer.from(request.body.message.data, 'base64').toString().trim()
  );

  // This is to make this endpoint accept different payloads and actions
  // in the future. Ideally, we'd then split out all different event
  // handlers into dedicated modules for clarity and isolation
  if (payload.name !== 'stale-triage-notifier') {
    reply.code(400);
    reply.send();
    return;
  }

  // Respond early to not block the webhook sender
  reply.code(204);
  reply.send();

  const octokit = await getClient(ClientType.App, OWNER);
  const repos: string[] = payload.repos || DEFAULT_REPOS;
  const now = moment().utc();

  // 1. Get all open, untriaged issues
  // 2. Get all the events for each of the remaining issues
  // 3. Find the latest `label` event for the UNTRIAGED_LABEL
  // 4. Get the time elapsed since that latest labeling event above
  // 5. Filter out the issues which were labeled more than MAX_TRIAGE_TIME ago
  const getIssueSLOInfoForRepo = async (
    repo: string
  ): Promise<IssueSLOInfo[]> => {
    const untriagedIssues = await octokit.paginate(octokit.issues.listForRepo, {
      owner: OWNER,
      repo,
      state: 'open',
      labels: UNTRIAGED_LABEL,
      per_page: GH_API_PER_PAGE,
    });

    const issuesWithSLOInfo = untriagedIssues.map(async (issue) => ({
      url: issue.html_url,
      number: issue.number,
      title: issue.title,
      teamLabel: getIssueTeamLabel(issue),
      triageBy: await getTriageSLOTimestamp(octokit, repo, issue.number),
    }));

    return Promise.all(issuesWithSLOInfo);
  };

  const issuesToNotifyAbout = (
    await Promise.all(repos.map(getIssueSLOInfoForRepo))
  ).flat();

  // Get an N-to-N mapping of "Team: *" labels to issues
  const teamToIssuesMap: Record<string, IssueSLOInfo[]> = {};
  const teamsToNotify = new Set() as Set<string>;
  issuesToNotifyAbout.forEach((data) => {
    if (data.teamLabel in teamToIssuesMap) {
      teamToIssuesMap[data.teamLabel].push(data);
    } else {
      teamToIssuesMap[data.teamLabel] = [data];
      teamsToNotify.add(data.teamLabel);
    }
  });
  // Get a mapping from Channels to subscribed teams
  const notificationChannels: Record<string, string[]> = (
    await getLabelsTable()
      .select('label_name', 'channel_id')
      .whereIn('label_name', Array.from(teamsToNotify))
  ).reduce((res, { label_name, channel_id }) => {
    const teams = res[channel_id] || [];
    teams.push(label_name);
    res[channel_id] = teams;
    return res;
  }, {});

  // Notify all channels associated with the relevant `Team: *` label per issue
  const notifications = constructSlackMessage(
    notificationChannels,
    teamToIssuesMap,
    now
  );
  // Do all this in parallel and wait till all finish
  await Promise.all(notifications);
  tx.finish();
};

// Test command for `sentry-docs` repo:
// curl -X POST 'http://127.0.0.1:3000/webhooks/pubsub' -H "Content-Type: application/json" -d '{"message": {"data": "eyJuYW1lIjoic3RhbGUtdHJpYWdlLW5vdGlmaWVyIiwicmVwb3MiOlsic2VudHJ5LWRvY3MiXX0="}}'
// `message.data` is a Base64-encoded JSON string that is a `PubSubPayload` object

import { Octokit } from '@octokit/rest';
import * as Sentry from '@sentry/node';
import { FastifyReply, FastifyRequest } from 'fastify';
import moment from 'moment-timezone';

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

const DEFAULT_REPOS = [SENTRY_REPO];
const GH_API_PER_PAGE = 100;
const DEFAULT_TEAM_LABEL = 'Team: Open Source';

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

const getTriageSLOTimestamp = async (
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
  // Due to @octokit/webhooks upgrade, created_at is now string|undefined
  const parseBodyForDatetime = lastRouteComment.body?.match(
    /<time datetime=(?<timestamp>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3})Z>/
  )?.groups;
  if (!parseBodyForDatetime?.timestamp) {
    Sentry.captureException(
      new Error(
        `Could not parse timestamp from comments for  ${repo}/issues/${issue_number}`
      )
    );
    return moment().toISOString();
  }
  return parseBodyForDatetime.timestamp;
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
  const now = moment();

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
  )
    .flat()
    .filter((data) => now.isAfter(data.triageBy));

  // Get an N-to-N mapping of `Team: *` labels to Slack Channels
  const teamToIssuesMap = {};
  const teamsToNotify = new Set() as Set<string>;
  issuesToNotifyAbout.forEach((data) => {
    if (data.teamLabel in teamToIssuesMap) {
      teamToIssuesMap[data.teamLabel].push(data);
    } else {
      teamToIssuesMap[data.teamLabel] = [data];
      teamsToNotify.add(data.teamLabel);
    }
  });
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
  const notifications = Object.keys(notificationChannels).flatMap(
    (channelId) => {
      let overdue = '';
      let actFast = '';
      let triageQueue = '';
      notificationChannels[channelId].map((team) => {
        teamToIssuesMap[team].forEach(({ url, number, title, triageBy }) => {
          if (now.diff(triageBy, 'hours') <= -4) {
            actFast += `\n- <${url}|#${number} ${title}>`;
          } else if (now.diff(triageBy, 'hours') >= 0) {
            overdue += `\n- <${url}|#${number} ${title}>`;
          } else {
            triageQueue += `\n- <${url}|#${number} ${title}>`;
          }
        });
      });
      return bolt.client.chat.postMessage({
        channel: channelId,
        text: `Hey! You have some tickets to triage:

🚨 *Overdue* 😰
${overdue}

⌛️ *Act fast!* 😨
${actFast}

⏳ *Triage Queue* 😯
${triageQueue}`,
      });
    }
  );
  // Do all this in parallel and wait till all finish
  await Promise.all(notifications);
  tx.finish();
};

// Test command for `sentry-docs` repo:
// curl -X POST 'http://127.0.0.1:3000/webhooks/pubsub' -H "Content-Type: application/json" -d '{"message": {"data": "eyJuYW1lIjoic3RhbGUtdHJpYWdlLW5vdGlmaWVyIiwicmVwb3MiOlsic2VudHJ5LWRvY3MiXX0="}}'
// `message.data` is a Base64-encoded JSON string that is a `PubSubPayload` object

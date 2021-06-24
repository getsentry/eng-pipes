import { ServerResponse } from 'http';

import { Octokit } from '@octokit/rest';
import { FastifyReply, FastifyRequest } from 'fastify';

import { getLabelsTable } from '@/brain/issueTriageNotifier';
import {
  DAY_IN_MS,
  OWNER,
  SENTRY_REPO,
  TEAM_LABEL_PREFIX,
  UNTRIAGED_LABEL,
} from '@/config';
import { getClient } from '@api/github/getClient';
import { bolt } from '@api/slack';

const DEFAULT_REPOS = [SENTRY_REPO];
const MAX_TRIAGE_TIME = 4 * DAY_IN_MS;
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
  overSLO: boolean;
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

const getIssueTeamLabel = (issue: { labels: { name: string }[] }) =>
  issue.labels.find((label) => label.name.startsWith(TEAM_LABEL_PREFIX))
    ?.name || DEFAULT_TEAM_LABEL;

const getRoutingTimestamp = async (
  octokit: Octokit,
  repo: string,
  issue_number: number
) => {
  const { data } = await octokit.issues.listEvents({
    owner: OWNER,
    repo,
    issue_number,
    per_page: GH_API_PER_PAGE,
  });

  const routingEvents = data.filter(
    (event) =>
      // @ts-ignore - We _know_ a `label` property exists on `labeled` events
      event.event === 'labeled' && event.label.name === UNTRIAGED_LABEL
  );
  const lastRouteEvent = routingEvents[routingEvents.length - 1];
  return Date.parse(lastRouteEvent.created_at);
};

export const handler = async (
  request: FastifyRequest,
  reply: FastifyReply<ServerResponse>
) => {
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

  const octokit = await getClient(OWNER);
  const repos: string[] = payload.repos || DEFAULT_REPOS;
  const SLO = payload.slo || MAX_TRIAGE_TIME;
  const now = Date.now();

  // 1. Get all open, untriaged issues
  // 2. Get all the events for each of the remaining issues
  // 3. Find the latest `label` event for the UNTRIAGED_LABEL
  // 4. Get the time elapsed since that latest labeling event above
  // 5. Filter out the issues which were labeled more than MAX_TRIAGE_TIME ago
  const getIssueSLOInfoForRepo = async (
    repo: string
  ): Promise<IssueSLOInfo[]> => {
    const { data: untriagedIssues } = await octokit.issues.listForRepo({
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
      // TODO(byk): Make this business days (at least weekend-aware)
      overSLO:
        now - (await getRoutingTimestamp(octokit, repo, issue.number)) >= SLO,
    }));

    return Promise.all(issuesWithSLOInfo);
  };

  const issuesOverSLO = (await Promise.all(repos.map(getIssueSLOInfoForRepo)))
    .flat()
    .filter((data) => data.overSLO);

  // Get an N-to-N mapping of `Team: *` labels to Slack Channels
  const teamsToNotify = new Set(
    issuesOverSLO.map((data) => data.teamLabel)
  ) as Set<string>;
  const notificationChannels: Record<string, string[]> = (
    await getLabelsTable()
      .select('label_name', 'channel_id')
      .whereIn('label_name', Array.from(teamsToNotify))
  ).reduce((res, { label_name, channel_id }) => {
    const channels = res[label_name] || [];
    channels.push(channel_id);
    res[label_name] = channels;
    return res;
  }, {});

  // Notify all channels associated with the relevant `Team: *` label per issue
  const notifications = issuesOverSLO.flatMap(
    ({ url, number, title, teamLabel }) =>
      notificationChannels[teamLabel].map((channel) =>
        bolt.client.chat.postMessage({
          channel,
          text: `⚠ Issue over triage SLO: <${url}|#${number} ${title}>`,
        })
      )
  );
  // Do all this in parallel and wait till all finish
  await Promise.all(notifications);
};

// Test command for `sentry-docs` repo:
// curl -X POST 'http://127.0.0.1:3000/webhooks/pubsub' -H "Content-Type: application/json" -d '{"message": {"data": "eyJuYW1lIjoic3RhbGUtdHJpYWdlLW5vdGlmaWVyIiwicmVwb3MiOlsic2VudHJ5LWRvY3MiXX0="}}'
// `message.data` is a Base64-encoded JSON string that is a `PubSubPayload` object

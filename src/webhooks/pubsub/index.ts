import {
  getLabelsTable,
  TEAM_LABEL_PREFIX,
  UNTRIAGED_LABEL,
} from '@/brain/issueTriageNotifier';
import { DAY_IN_MS, OWNER, SENTRY_REPO } from '@/config';
import { getClient } from '@api/github/getClient';
import { bolt } from '@api/slack';

const DEFAULT_REPOS = [SENTRY_REPO];
const MAX_TRIAGE_TIME = 4 * DAY_IN_MS;
const GH_API_PER_PAGE = 100;

type PubSubPayload = {
  name: string;
  slo?: number;
  repos?: string[];
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

export const handler = async (request, reply) => {
  const payload: PubSubPayload = JSON.parse(
    Buffer.from(request.body.message.data, 'base64').toString().trim()
  );

  if (payload.name !== 'stale-triage-notifier') {
    reply.code(400);
    return reply.send();
  }

  reply.code(204);
  reply.send();

  const octokit = await getClient(OWNER);
  const repos: string[] = payload.repos || DEFAULT_REPOS;
  const SLO = payload.slo || MAX_TRIAGE_TIME;
  const now = Date.now();

  const issuesOverSLO = (
    await Promise.all(
      repos.map(async (repo) => {
        const untriagedIssues = (
          await octokit.issues.listForRepo({
            owner: OWNER,
            repo,
            state: 'open',
            labels: UNTRIAGED_LABEL,
            per_page: GH_API_PER_PAGE,
          })
        ).data;

        return Promise.all(
          untriagedIssues.map(async (issue) => {
            const teamLabel = issue.labels.find((label) =>
              label.name.startsWith(TEAM_LABEL_PREFIX)
            )?.name;

            if (!teamLabel) {
              // This and the `flat(2)` below are to workaround
              // https://github.com/microsoft/TypeScript/issues/16069#issuecomment-565658443
              return [];
            }

            const { data } = await octokit.issues.listEvents({
              owner: OWNER,
              repo,
              issue_number: issue.number,
              per_page: GH_API_PER_PAGE,
            });

            const untriagedLabelEvents = data.filter(
              (event) =>
                event.event === 'labeled' &&
                // @ts-ignore - We _know_ there's a `label` prop for `labeled` events
                event.label.name === UNTRIAGED_LABEL
            );
            const lastUntriagedLabelEvent =
              untriagedLabelEvents[untriagedLabelEvents.length - 1];
            const labelTime = Date.parse(lastUntriagedLabelEvent.created_at);

            return {
              issue,
              teamLabel,
              labelTime,
            };
          })
        );
      })
    )
  )
    .flat(2)
    // TODO(byk): Make this business days (at least weekend-aware)
    .filter((data) => now - data.labelTime >= SLO);

  const teamsToNotify = new Set(
    issuesOverSLO.map((data) => data.teamLabel)
  ) as Set<string>;
  const notificationChannels: Record<string, string> = Object.fromEntries(
    (
      await getLabelsTable()
        .select('label_name', 'channel_id')
        .whereIn('label_name', Array.from(teamsToNotify))
    ).map((row) => [row.label_name, row.channel_id])
  );

  await Promise.all(
    issuesOverSLO.map(async ({ issue, teamLabel }) =>
      bolt.client.chat.postMessage({
        text: `⚠ Issue over triage SLO: <${issue.html_url}|#${issue.number} ${issue.title}>`,
        channel: notificationChannels[teamLabel],
      })
    )
  );
};

// Test command for `sentry-docs` repo:
// curl -X POST 'http://127.0.0.1:3000/webhooks/pubsub' -H "Content-Type: application/json" -d '{"message": {"data": "eyJuYW1lIjoic3RhbGUtdHJpYWdlLW5vdGlmaWVyIiwicmVwb3MiOlsic2VudHJ5LWRvY3MiXX0="}}'
// `message.data` is a Base64-encoded JSON string that is a `PubSubPayload` object

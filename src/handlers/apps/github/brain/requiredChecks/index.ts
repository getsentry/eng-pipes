import * as Sentry from '@sentry/node';
import { KnownBlock } from '@slack/types';

import { ReposGetCommit } from '@types';

import {
  OWNER,
  GETSENTRY_REPO,
  REQUIRED_CHECK_NAME,
  REQUIRED_CHECK_CHANNEL,
  SENTRY_REPO,
} from '@app/config';
import { web } from '@api/slack';
import { githubEvents } from '@app/api/github';
import { getClient } from '@app/api/github/getClient';
import { EventTypesPayload } from '@octokit/webhooks';

const OK_CONCLUSIONS = ['success', 'neutral', 'skipped'];

/**
 * Transform GitHub Markdown link to Slack link
 */
function githubMdToSlack(str: string) {
  const pattern = /\[([^\]]+)\]\(([^)]+)\)/;
  const matches = str.match(pattern);
  if (matches) {
    return `<${matches[2]}|${matches[1]}>`;
  }

  return str;
}
/**
 * Use a GitHub commit object and turn it to a pretty slack message
 */
function getBlocksForCommit(commit: ReposGetCommit | null): KnownBlock[] {
  if (!commit) {
    return [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Unable to fetch relevant commit`,
        },
      },
    ];
  }

  const [commitTitle, ...commitBody] = commit.commit.message.split('\n');

  const authorName =
    commit.commit.author?.name || commit.commit.author?.email || 'Unknown';
  const login = commit.author?.login;
  const avatarUrl = commit.author?.avatar_url || '';

  const commitBlocks: KnownBlock[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `Relevant commit`,
      },
    },

    { type: 'divider' },

    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `<${commit.html_url}|*${commitTitle}*>`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: commitBody.filter(Boolean).join('\n'),
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'image',
          image_url: avatarUrl,
          alt_text: authorName,
        },
        {
          type: 'mrkdwn',
          text: `<${commit.author?.html_url}|${authorName}${
            login ? ` (${login})` : ''
          }>`,
        },
      ],
    },
  ];

  return commitBlocks;
}

/**
 * Attempts to find the relevant commit for a sha from a check run
 *
 * This can be the getsentry commit or a sentry commit
 */
async function getRelevantCommit(ref: string) {
  try {
    const octokit = await getClient(OWNER, GETSENTRY_REPO);

    // Attempt to get the getsentry commit first
    const { data: commit } = await octokit.repos.getCommit({
      owner: OWNER,
      repo: GETSENTRY_REPO,
      ref,
    });

    if (!commit) {
      return null;
    }
    const commitMatches = commit.commit.message.match(
      /getsentry\/sentry@(\w+)/
    );
    const sentryCommitSha = commitMatches?.[1];

    if (sentryCommitSha) {
      // If this matches, then it means the commit was a bump from the getsentry bot due to
      // a merge in the sentry repo
      //
      // In this case, fetch the sentry commit to display
      const { data } = await octokit.repos.getCommit({
        owner: OWNER,
        repo: SENTRY_REPO,
        ref: sentryCommitSha,
      });

      return data;
    }

    return commit;
  } catch (err) {
    Sentry.captureException(err);
    return null;
  }
}

async function handler({ payload }: EventTypesPayload['check_run']) {
  // Only on `getsentry` repo
  if (payload.repository?.full_name !== 'getsentry/getsentry') {
    return;
  }

  const { check_run: checkRun } = payload;

  // Only care about completed checks
  if (checkRun.status !== 'completed') {
    return;
  }

  if (checkRun.name !== REQUIRED_CHECK_NAME) {
    return;
  }

  // Conclusion can be one of:
  //   success, failure, neutral, cancelled, skipped, timed_out, or action_required
  //
  // Ignore "successful" conclusions
  if (OK_CONCLUSIONS.includes(checkRun.conclusion || '')) {
    return;
  }

  console.log(
    `Received failed check run ${checkRun.id} for commit ${checkRun.head_sha}`
  );

  // Retrieve commit information
  const relevantCommit = await getRelevantCommit(checkRun.head_sha);

  const commitBlocks = getBlocksForCommit(relevantCommit);

  // Otherwise, there is a failed check
  // Need to notify channel that the build has failed
  // We need to include:
  // 1) A link to the getsentry commit
  //   1a) a link to the sentry commit if possible
  // 2) The author of the failed commit (will need to lookup their slack user from their gh email)
  // 3) A list of the failed checks (job name, duration, status)
  // 4) Button to re-run job
  const failedJobs = checkRun.output?.text
    ?.split('\n')
    .filter((text) => text.startsWith('|'))
    .slice(2) // First 2 rows are table headers + spacer
    .map((text) => text.split('|').filter(Boolean)) // Split and filter out empty els
    .filter(([, conclusion]) => !OK_CONCLUSIONS.includes(conclusion));

  const commitLink = `https://github.com/${OWNER}/${GETSENTRY_REPO}/commits/${checkRun.head_sha}`;
  const commitLinkText = `${checkRun.head_sha.slice(0, 7)}`;
  const buildLink = `<${checkRun.html_url}|View Build>`;
  const text = `${GETSENTRY_REPO}@master <${commitLink}|${commitLinkText}> is failing (${buildLink})`;
  const jobsList = failedJobs
    ?.map(
      ([jobName, conclusion]) => `${githubMdToSlack(jobName)} - ${conclusion}`
    )
    .join('\n');

  const message = await web.chat.postMessage({
    channel: REQUIRED_CHECK_CHANNEL,
    text,
    attachments: [
      {
        color: '#F55459',
        blocks: [...commitBlocks],
      },
    ],
  });

  // Add thread for jobs list
  web.chat.postMessage({
    channel: `${message.channel}`,
    thread_ts: `${message.ts}`,
    text: `Here are the job statuses

${jobsList}`,
  });
}

export async function requiredChecks() {
  githubEvents.removeListener('check_run', handler);
  githubEvents.on('check_run', handler);
}

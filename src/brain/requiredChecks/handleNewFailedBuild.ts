import { EmitterWebhookEvent } from '@octokit/webhooks';
import * as Sentry from '@sentry/node';

import { revertCommit as revertCommitBlock } from '@/blocks/revertCommit';
import { BuildStatus, Color, REQUIRED_CHECK_CHANNEL } from '@/config';
import { SlackMessage } from '@/config/slackMessage';
import { getBlocksForCommit } from '@api/getBlocksForCommit';
import { getRelevantCommit } from '@api/github/getRelevantCommit';
import { bolt } from '@api/slack';
import { getFailureMessages } from '@utils/db/getFailureMessages';
import { saveSlackMessage } from '@utils/db/saveSlackMessage';

import { OK_CONCLUSIONS } from './constants';
import { getTextParts } from './getTextParts';

interface HandleNewFailedBuildParams {
  checkRun: EmitterWebhookEvent<'check_run'>['payload']['check_run'];
}

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

export async function handleNewFailedBuild({
  checkRun,
}: HandleNewFailedBuildParams) {
  const tx = Sentry.startTransaction({
    op: 'brain',
    name: 'requiredChecks.failed',
    description: 'Required check failed',
  });
  // Retrieve commit information
  const relevantCommit = await getRelevantCommit(checkRun.head_sha);

  const commitBlocks = await getBlocksForCommit(relevantCommit, {
    shouldSlackMention: true,
  });

  // Otherwise, there is a failed check
  // Need to notify channel that the build has failed
  // We need to include:
  // 1) A link to the getsentry commit
  //   1a) a link to the sentry commit if possible
  // 2) The author of the failed commit (will need to lookup their slack user from their gh email)
  // 3) A list of the failed checks (job name, duration, status)
  // 4) Button to re-run job
  const jobs = checkRun.output?.text
    ?.split('\n')
    .filter((text) => text.startsWith('|'))
    .slice(2) // First 2 rows are table headers + spacer
    .map((text) => text.split('|').filter(Boolean)); // Split and filter out empty els

  const failedJobs =
    jobs?.filter(
      ([, conclusion]) =>
        !OK_CONCLUSIONS.includes(conclusion.trim().split(' ').slice(-1)[0])
    ) ?? [];

  // If all failed jobs are just missing, and the # of missing jobs represents > 50% of all jobs...
  // then ignore it. Due to GHA, it's difficult to tell if a job is actually missing vs it hasn't started yet
  const missingJobs = failedJobs.filter(([, conclusion]) =>
    conclusion.includes('missing')
  );

  if (
    missingJobs.length === failedJobs.length &&
    missingJobs.length >= (jobs?.length ?? 0) / 2
  ) {
    Sentry.withScope((scope) => {
      scope.setContext('Check Run', {
        id: checkRun.id,
        url: checkRun.html_url,
        sha: checkRun.head_sha,
      });
      scope.setContext('Required Checks - Missing Jobs', {
        missingJobs,
      });
      Sentry.startTransaction({
        op: 'debug',
        name: 'requiredChecks.missing',
      }).finish();
    });
    return;
  }

  const text = getTextParts(checkRun).join(' ');
  const jobsList = jobs
    ?.map(
      ([jobName, conclusion]) => `${githubMdToSlack(jobName)} - ${conclusion}`
    )
    .join('\n');

  // Check if getsentry is already in a failing state, if it is then do not ping `REQUIRED_CHECK_CHANNEL` until
  // we are green again. This can happen when either 1) getsentry is actually broken or 2) flakey tests
  const [existingFailureMessage] = await getFailureMessages();

  const newFailureMessage =
    !existingFailureMessage &&
    (await bolt.client.chat.postMessage({
      channel: REQUIRED_CHECK_CHANNEL,
      text,
      attachments: [
        {
          color: Color.DANGER,
          blocks: [
            ...commitBlocks,
            ...(relevantCommit
              ? [
                  {
                    type: 'actions',
                    // @ts-ignore
                    elements: [
                      revertCommitBlock({
                        sha: relevantCommit?.sha,
                        repo:
                          relevantCommit?.sha === checkRun.head_sha
                            ? 'getsentry'
                            : 'sentry',
                      }),
                    ],
                  },
                ]
              : []),
          ],
        },
      ],
    }));

  // Only thread jobs list statuses for new failures
  if (newFailureMessage) {
    // Add thread for jobs list
    await bolt.client.chat.postMessage({
      channel: `${newFailureMessage.channel}`,
      thread_ts: `${newFailureMessage.ts}`,
      text: `Here are the job statuses

${jobsList}`,
    });
  }

  // Thread the current failure to existing failure message
  const followupFailureMessage =
    existingFailureMessage &&
    (await bolt.client.chat.postMessage({
      channel: `${existingFailureMessage.channel}`,
      thread_ts: `${existingFailureMessage.ts}`,
      text,
      attachments: [
        {
          color: Color.DANGER,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `This *may* be failing only due to a previous commit`,
              },
            },
            ...commitBlocks,
          ],
        },
      ],
    }));

  // DEBUG: Not sure why this messages sometimes does not get threaded.
  // The Slack API should make this threaded because existingFailureMessage exists
  // eslint-disable-next-line no-console
  console.log({ existingFailureMessage, followupFailureMessage });

  // ts bugging out but one of these has to exist and not be falsey
  const postedMessage = (newFailureMessage ||
    followupFailureMessage) as Exclude<
    typeof followupFailureMessage,
    false | undefined
  >;

  // Save failing required check run to db
  await saveSlackMessage(
    SlackMessage.REQUIRED_CHECK,
    {
      refId: checkRun.head_sha,
      channel: `${postedMessage.channel}`,
      ts: `${postedMessage.ts}`,
    },
    {
      // Always record the status as failing, even though commits following a broken build is not known since it could be
      // failing of its own accord, or due to a previous commit
      status: BuildStatus.FAILURE,
      failed_at: new Date(),
    }
  );

  tx.finish();
}
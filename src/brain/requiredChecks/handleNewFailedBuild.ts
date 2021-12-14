import * as Sentry from '@sentry/node';

import { jobStatuses } from '@/blocks/jobStatuses';
import { revertCommit as revertCommitBlock } from '@/blocks/revertCommit';
import { BuildStatus, Color, REQUIRED_CHECK_CHANNEL } from '@/config';
import { SlackMessage } from '@/config/slackMessage';
import { CHECK_RUN_PROPERTIES, CheckRun, CheckRunProperty } from '@/types';
import { getBlocksForCommit } from '@api/getBlocksForCommit';
import { getRelevantCommit } from '@api/github/getRelevantCommit';
import { bolt } from '@api/slack';
import { getFailureMessages } from '@utils/db/getFailureMessages';
import { saveSlackMessage } from '@utils/db/saveSlackMessage';

import { OK_CONCLUSIONS } from './constants';
import { extractRunId } from './extractRunId';
import { getAnnotations } from './getAnnotations';
import { getTextParts } from './getTextParts';
import { recordFailures } from './recordFailure';
import { rerunFlakeyJobs } from './rerunFlakeyJobs';

interface HandleNewFailedBuildParams {
  checkRun: CheckRun;
}

/**
 * The conclusion from the GH Required Checks check has an emoji as a prefix,
 * strip it and return a trimmed string
 *
 * @param str Conclusion string from the GitHub Required Checks check
 */
function getConclusionString(str: string) {
  return str.trim().split(' ').slice(-1)[0];
}

type AllowedCheckRunPropertyTuple = [CheckRunProperty, any];
function isAllowedCheckRunProperty(
  tuple: [any, any]
): tuple is AllowedCheckRunPropertyTuple {
  return CHECK_RUN_PROPERTIES.includes(tuple[0]);
}

export async function handleNewFailedBuild({
  checkRun,
}: HandleNewFailedBuildParams) {
  const tx = Sentry.startTransaction({
    op: 'brain',
    name: 'requiredChecks.failed',
    description: 'Required check failed',
  });

  const rerunTx = Sentry.startTransaction({
    op: 'brain',
    name: 'requiredChecks.rerunning',
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

  const failedOrMissingJobs =
    jobs?.filter(
      ([, conclusion]) =>
        !OK_CONCLUSIONS.includes(getConclusionString(conclusion))
    ) ?? [];

  // If all failed jobs are just missing, and the # of missing jobs represents > 50% of all jobs...
  // then ignore it. Due to GHA, it's difficult to tell if a job is actually missing vs it hasn't started yet
  const missingJobs = failedOrMissingJobs.filter(([, conclusion]) =>
    conclusion.includes('missing')
  );

  if (
    missingJobs.length === failedOrMissingJobs.length &&
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
  // Check if getsentry is already in a failing state, if it is then do not ping `REQUIRED_CHECK_CHANNEL` until
  // we are green again. This can happen when either 1) getsentry is actually broken or 2) flakey tests
  const [existingFailureMessage] = await getFailureMessages();

  const failedJobs = failedOrMissingJobs.filter(
    ([, conclusion]) => !conclusion.includes('missing')
  );

  const { hasReruns } = await rerunFlakeyJobs(
    // TODO, extractRunId is a bit misleading, the id in these URLs are job ids
    // *AND* check run id (they are the same)
    failedJobs.map(([jobUrl]) => Number(extractRunId(jobUrl) ?? 0))
  );

  // Workflow(s) are being re-run, do not post in Slack channel about
  // failures *yet* since we only auto re-run if the first run attempt fails,
  // so that we do not constantly re-run without being able to fail.
  if (hasReruns) {
    rerunTx.finish();
    return;
  }

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
  if (newFailureMessage && !!jobs?.length) {
    // For each failed job, extract the check run id and then grab and parse the
    // annotations from GH.  These annotations will be sent in a thread to Slack
    // for the failing build.
    const annotationsByJob = await getAnnotations(failedJobs);

    // Add thread for jobs list
    await bolt.client.chat.postMessage({
      channel: `${newFailureMessage.channel}`,
      thread_ts: `${newFailureMessage.ts}`,
      text: `Here are the job statuses`,
      blocks: jobStatuses(jobs, annotationsByJob),
    });

    // Save to bot database (i.e. not BigQuery)
    recordFailures({ checkRun, jobs, annotationsByJob });
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

  // Save only the properties needed for `getTextParts()`
  const partialCheckRun = Object.fromEntries(
    Object.entries(checkRun).filter(isAllowedCheckRunProperty)
  );

  // Save failing required check run to db
  await saveSlackMessage(
    SlackMessage.REQUIRED_CHECK,
    {
      refId: checkRun.head_sha,
      channel: `${postedMessage.channel}`,
      ts: `${postedMessage.ts}`,
    },
    {
      // Always record the status as failing, even though commits following a
      // broken build is not known since it could be failing of its own accord,
      // or due to a previous commit
      status: BuildStatus.FAILURE,

      // TODO: The messages when we resolve a failing build is a bit goofy right
      // now, It edits the message with the checkRun that *fixed* the broken
      // build, so you lose context Of what build originally failed. We can
      // create a proper message edit with saving this check run
      checkRun: partialCheckRun,
      failed_at: checkRun.completed_at
        ? new Date(checkRun.completed_at)
        : new Date(),
    }
  );

  tx.finish();
}

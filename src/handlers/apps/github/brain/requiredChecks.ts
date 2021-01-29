import { OWNER, GETSENTRY_REPO } from '@app/config';

import { web } from '@api/slack';
import { githubEvents } from '@app/api/github';

const OK_CONCLUSIONS = ['success', 'neutral', 'skipped'];
const REQUIRED_CHECK_NAME = 'getsentry required checks';
const SLACK_NOTIFICATION_CHANNEL = '#team-engineering';

/**
 * Transform GitHub Markdown link to Slack link
 */
function githubMdToSlack(str: string) {
  const pattern = /\[([^\]]+)\]\(([^)]+)\)/;
  const matches = str.match(pattern);
  console.log({ str, matches });
  if (matches) {
    return `<${matches[2]}|${matches[1]}>`;
  }

  return str;
}

export async function requiredChecks() {
  githubEvents.on('check_run', ({ payload }) => {
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
      .map((text) => text.split('|').filter(Boolean)) // Split and filter out empty els
      .filter(([, conclusion]) => conclusion.includes('failure'));

    const commitLink = `https://github.com/${OWNER}/${GETSENTRY_REPO}/commits/${checkRun.head_sha}`;
    const commitLinkText = `Commit ${checkRun.head_sha.slice(0, 7)}`;
    const message = `<${commitLink}|${commitLinkText}> failed (<${
      checkRun.html_url
    }|View Build>)

${failedJobs
  ?.map(
    ([jobName, conclusion]) => `${githubMdToSlack(jobName)} - ${conclusion}`
  )
  .join('\n')}`;

    console.log(message);

    web.chat.postMessage({
      channel: SLACK_NOTIFICATION_CHANNEL,
      text: `Build has failed on ${OWNER}/${GETSENTRY_REPO}@master`,
      attachments: [
        {
          color: '#F55459',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: message,
              },
            },
          ],
        },
      ],
    });
  });
}

import { EventTypesPayload } from '@octokit/webhooks';
import * as Sentry from '@sentry/node';

import { getBlocksForCommit } from '@api/getBlocksForCommit';
import { getUser } from '@api/getUser';
import { getRelevantCommit } from '@api/github/getRelevantCommit';
import { bolt } from '@api/slack';
import { githubEvents } from '@app/api/github';
import { Color, GETSENTRY_REPO, OWNER } from '@app/config';
import { isGetsentryRequiredCheck } from '@app/handlers/apps/github/utils/isGetsentryRequiredCheck';

async function handler({
  id,
  payload,
  ...rest
}: EventTypesPayload['check_run']) {
  // Make sure this is on `getsentry` and we are examining the aggregate "required check" run
  if (!isGetsentryRequiredCheck({ id, payload, ...rest })) {
    return;
  }

  const { check_run: checkRun } = payload;

  // Conclusion can be one of:
  //   success, failure, neutral, cancelled, skipped, timed_out, or action_required
  //
  // Ignore non-"successful" conclusions
  if (checkRun.conclusion !== 'success') {
    return;
  }

  // Find the author of the commit, we should probably link both getsentry? and sentry?
  const relevantCommit = await getRelevantCommit(checkRun.head_sha);

  if (!relevantCommit) {
    Sentry.setContext('checkRun', {
      head_sha: checkRun.head_sha,
    });
    Sentry.captureException(new Error('Unable to find commit'));
    return;
  }

  // Message author on slack that they're commit is ready to deploy
  // and send a link to open freight
  const user = await getUser({
    github: relevantCommit.author?.login,
    email: relevantCommit.commit.author?.email,
  });

  // XXX(billy): Just debugging for now
  // const slackTarget = !user ? '#z-billy' : user.slackUser;

  // Author of commit found
  const commitBlocks = getBlocksForCommit(relevantCommit);
  const text = `Your commit is ready to deploy`;
  // Ready to deploy getsentry@${checkRun.head_sha}`
  const commitLink = `https://github.com/${OWNER}/${GETSENTRY_REPO}/commits/${checkRun.head_sha}`;
  const commitLinkText = `${checkRun.head_sha.slice(0, 7)}`;
  const freightDeployUrl = 'https://freight.getsentry.net/deploy?app=getsentry';

  await bolt.client.chat.postMessage({
    channel: '#z-billy',
    text,
    attachments: [
      {
        color: Color.NEUTRAL,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `getsentry@<${commitLink}|${commitLinkText}> - <${freightDeployUrl}|Deploy>

Found slack user: ${user?.slackUser ?? 'no'}
`,
            },
            // TODO(billy): Make this work without warning symbol
            // Requires setting up interactivity.
            // accessory: {
            // type: 'button',
            // text: {
            // type: 'plain_text',
            // text: 'Deploy',
            // emoji: true,
            // },
            // value: checkRun.head_sha,
            // url: 'https://freight.getsentry.net/deploy?app=getsentry',
            // action_id: 'freight-deploy',
            // },
          },
          ...commitBlocks,
        ],
      },
    ],
  });

  // TODO(billy): Deploy directly, save user + sha in db state,
  // Follow up messages with commits that are being deployed
  // Tag people whose commits are being deployed
}

export async function pleaseDeployNotifier() {
  githubEvents.removeListener('check_run', handler);
  githubEvents.on('check_run', handler);
}

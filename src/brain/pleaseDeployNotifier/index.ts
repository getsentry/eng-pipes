import { EmitterWebhookEvent } from '@octokit/webhooks';
import * as Sentry from '@sentry/node';

import { githubEvents } from '@/api/github';
import { getChangedStack } from '@/api/github/getChangedStack';
import { freightDeploy } from '@/blocks/freightDeploy';
import { getUpdatedDeployMessage } from '@/blocks/getUpdatedDeployMessage';
import { muteDeployNotificationsButton } from '@/blocks/muteDeployNotificationsButton';
import { viewUndeployedCommits } from '@/blocks/viewUndeployedCommits';
import { Color, GETSENTRY_REPO, OWNER, SENTRY_REPO } from '@/config';
import { SlackMessage } from '@/config/slackMessage';
import { getDeployForQueuedCommit } from '@/utils/db/getDeployForQueuedCommit';
import { getLatestDeployBetweenProjects } from '@/utils/db/getLatestDeployBetweenProjects';
import { getBlocksForCommit } from '@api/getBlocksForCommit';
import { getUser } from '@api/getUser';
import { ClientType, getClient } from '@api/github/getClient';
import { getRelevantCommit } from '@api/github/getRelevantCommit';
import { isGetsentryRequiredCheck } from '@api/github/isGetsentryRequiredCheck';
import { bolt } from '@api/slack';
import { slackMessageUser } from '@api/slackMessageUser';
import { saveSlackMessage } from '@utils/db/saveSlackMessage';
import { wrapHandler } from '@utils/wrapHandler';

import { actionSlackDeploy } from './actionSlackDeploy';
import { actionViewUndeployedCommits } from './actionViewUndeployedCommits';

/**
 * Get the latest deployed commit between "getsentry" and "getsentry-frontend"
 * and then get the list of commits from the `head` and the latest deployed
 * commit.
 *
 * For each commit that will be deployed, check if they only contain frontend
 * changes. It can be a frontend deploy only if this is true.
 *
 * Requiring only frontend changes will reduce the changes of deploying a
 * frontend change that is dependent on a backend change.
 */
async function canFrontendDeploy(base: string, head: string) {
  try {
    const octokit = await getClient(ClientType.App, OWNER);
    // Find the list of commits with base being the most recently deployed
    // commit and the supplied commit (e.g. the commit that just finished its
    // check runs)
    const { data } = await octokit.repos.compareCommits({
      owner: OWNER,
      repo: GETSENTRY_REPO,
      base,
      head,
    });

    // We should be able to assume that the `head` commit already allows
    // frontend only deploys, as this function should not be called otherwise.
    // The head commit will be the last element in `data.commits`.
    const commits = data.commits.slice(0, -1);

    // Call `getChangedStack` and every commit, which queries GH API for a GH
    // check run status.
    const changedStacks = await Promise.all(
      commits.map(
        async (commit) => await getChangedStack(commit.sha, GETSENTRY_REPO)
      )
    );

    // eslint-disable-next-line no-console
    console.debug(`
* canFrontendDeploy --> ${changedStacks.every(
      ({ isFrontendOnly }) => isFrontendOnly
    )} (${data.commits.map(({ sha }) => sha).join(', ')})
    `);

    return changedStacks.every(({ isFrontendOnly }) => isFrontendOnly);
  } catch (err) {
    // Capture to Sentry, but we can ignore errors, and assume it is not valid
    // for frontend-only deploy
    Sentry.captureException(err);
    console.error(err);

    return false;
  }
}

async function handler({
  id,
  payload,
  ...rest
}: EmitterWebhookEvent<'check_run'>) {
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

  const tx = Sentry.startTransaction({
    op: 'brain',
    name: 'pleaseDeployNotifier',
  });

  Sentry.configureScope((scope) => scope.setSpan(tx));

  // Message author on slack that they're commit is ready to deploy
  // and send a link to open freight
  const user = await getUser({
    githubUser: relevantCommit.author?.login,
    email: relevantCommit.commit.author?.email,
  });

  if (!user?.slackUser) {
    Sentry.withScope(async (scope) => {
      scope.setUser({
        email: relevantCommit.commit.author?.email,
      });
      tx.setStatus('no-user');
      tx.finish();
    });
    return;
  }

  const slackTarget = user?.slackUser;

  // Author of commit found
  const commitBlocks = await getBlocksForCommit(relevantCommit);
  const commit = checkRun.head_sha;
  const commitLink = `https://github.com/${OWNER}/${GETSENTRY_REPO}/commits/${commit}`;
  const commitLinkText = `${commit.slice(0, 7)}`;
  const text = `Your commit getsentry@<${commitLink}|${commitLinkText}> is ready to deploy`;

  // Look for queued commits and see if current commit is queued
  const queuedCommit = await getDeployForQueuedCommit(commit);

  // checkRun.head_sha will always be from getsentry, so if relevantCommit's
  // sha differs, it means that the relevantCommit is on the sentry repo
  const relevantCommitRepo =
    relevantCommit.sha === checkRun.head_sha ? GETSENTRY_REPO : SENTRY_REPO;

  // If the commit contains only frontend changes, link user to deploy the
  // `getsentry-frontend` Freight app
  const { isFrontendOnly: isHeadCommitFrontendOnly } = await getChangedStack(
    relevantCommit.sha,
    relevantCommitRepo
  );

  let latestDeploy;

  try {
    // Retrieves the latest deploy between `getsentry` and `getsentry-frontend`,
    // which shares the same repo
    latestDeploy = await getLatestDeployBetweenProjects();
  } catch (err) {
    Sentry.captureException(err);
    console.error(err);
  }

  const isFrontendOnly = !latestDeploy
    ? isHeadCommitFrontendOnly
    : isHeadCommitFrontendOnly
    ? await canFrontendDeploy(latestDeploy.sha, checkRun.head_sha)
    : false;

  const actions = [
    freightDeploy(commit, isFrontendOnly ? 'getsentry-frontend' : 'getsentry'),
    viewUndeployedCommits(commit),
    muteDeployNotificationsButton(),
  ];

  const blocks = [
    ...commitBlocks,

    queuedCommit
      ? {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: getUpdatedDeployMessage({
              isUserDeploying: queuedCommit.user == user.email,
              payload: {
                ...queuedCommit,
                deploy_number: queuedCommit.external_id,
              },
            }),
          },
        }
      : {
          type: 'actions',
          elements: actions,
        },
  ];

  const message = await slackMessageUser(slackTarget, {
    text,
    attachments: [
      {
        color: Color.OFF_WHITE_TOO,
        blocks,
      },
    ],
  });

  if (message) {
    await saveSlackMessage(
      SlackMessage.PLEASE_DEPLOY,
      {
        refId: commit,
        channel: `${message.channel}`,
        ts: `${message.ts}`,
      },
      {
        target: slackTarget,
        status: 'undeployed',
        blocks,
        text,
      }
    );
  }

  Sentry.withScope(async (scope) => {
    scope.setUser({
      id: slackTarget,
      email: relevantCommit.commit.author?.email,
    });
    tx.finish();
  });
}

export async function pleaseDeployNotifier() {
  githubEvents.removeListener('check_run', handler);
  githubEvents.on('check_run', handler);

  // We need to respond to button clicks, otherwise it will display a warning message
  bolt.action(/freight-deploy:(.*)/, async ({ ack, body, context }) => {
    await ack();
    Sentry.withScope(async (scope) => {
      scope.setUser({
        id: body.user.id,
      });
      const tx = Sentry.startTransaction({
        op: 'slack.action',
        name: `freight-deploy: ${context.actionIdMatches[1]}`,
      });
      tx.finish();
    });
    // TODO(billy): Call freight API directly to deploy
  });

  // Handles both mute and unmute action that comes from deploy notification
  bolt.action(
    /(unmute|mute)-slack-deploy/,
    wrapHandler('actionSlackDeploy', actionSlackDeploy)
  );

  // Handles viewing undeployed commits
  bolt.action(
    /view-undeployed-commits-.*/,
    wrapHandler('actionViewUndeployedCommits', actionViewUndeployedCommits)
  );
}

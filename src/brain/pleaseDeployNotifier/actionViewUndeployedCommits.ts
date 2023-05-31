import * as Sentry from '@sentry/node';

import { getBlocksForCommit } from '../../api/getBlocksForCommit';
import { ClientType } from '../../api/github/clientType';
import { getClient } from '../../api/github/getClient';
import { getRelevantCommit } from '../../api/github/getRelevantCommit';
import {
  GETSENTRY_REPO,
  GOCD_SENTRYIO_BE_PIPELINE_GROUP,
  GOCD_SENTRYIO_BE_PIPELINE_NAME,
  OWNER,
} from '../../config';
import { getLastGetSentryGoCDDeploy } from '../../utils/db/getLatestDeploy';
import { firstMaterialSHA } from '../../utils/gocdHelpers';

/**
 * Action handler for viewing undeployed commits. This should be useful for users
 * to see what commits are waiting to be deployed.
 */
export async function actionViewUndeployedCommits({
  ack,
  action,
  body,
  client,
  payload,
}) {
  await ack();

  // Open a "loading" modal so that we can respond as soon as possible
  const viewPromise = client.views.open({
    // Pass a valid trigger_id within 3 seconds of receiving it
    // @ts-ignore Slack types suxx
    trigger_id: body.trigger_id,
    // View payload
    view: {
      type: 'modal',
      // View identifier
      callback_id: 'view-undeployed-commits-modal',
      title: {
        type: 'plain_text',
        text: `Fetching commits`,
      },
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `:sentry-loading: Please wait while we fetch undeployed commits`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: ':warning: This is slow af (10+ seconds), <https://sentry.io/organizations/sentry/performance/summary/?environment=production&project=5246761&query=transaction.duration%3A%3C15m+event.type%3Atransaction+event.type%3Atransaction&showTransactions=recent&statsPeriod=7d&transaction=actionViewUndeployedCommits&unselectedSeries=p100%28%29|take a look> and let me know if you have any ideas. :6:',
          },
        },
      ],
    },
  });

  const lastDeploy = await getLastGetSentryGoCDDeploy(
    GOCD_SENTRYIO_BE_PIPELINE_GROUP,
    GOCD_SENTRYIO_BE_PIPELINE_NAME
  );
  if (!lastDeploy) {
    // Unable to find last successful deploy... can't continue
    return;
  }

  const octokit = await getClient(ClientType.App, OWNER);
  const base = firstMaterialSHA(lastDeploy);
  if (!base) {
    // Failed to get base sha
    return;
  }
  const head = payload.value;

  // Get all getsentry commits between `base` and `head`
  const { data } = await octokit.repos.compareCommits({
    owner: OWNER,
    repo: GETSENTRY_REPO,
    base,
    head,
  });

  // Get the "relevant" commits from either sentry or getsentry
  // We include `base` here as `compareCommits` does not
  const relevantCommits = await Promise.all(
    data.commits.map(({ sha }) => getRelevantCommit(sha, octokit))
  );

  const commitBlocks = (
    await Promise.all(
      relevantCommits.map(async (commit) => [
        ...(await getBlocksForCommit(commit)),
        { type: 'divider' },
      ])
    )
  ).flatMap((i) => i);

  // Find the attachments where this action was triggered so that
  // we can find the deploy button that was used
  const attachmentsContainer = body.message.attachments.find(
    ({ id }) => id === body.container.attachment_id
  );
  const actionsBlock = attachmentsContainer?.blocks.find(
    ({ block_id }) => block_id === action.block_id
  );
  const deployButton = actionsBlock?.elements.find(
    ({ action_id }) => action_id === 'gocd-deploy'
  );

  const { view } = await viewPromise;

  // Update loading modal with a list of commits that are undeployed.
  await client.views.update({
    // @ts-ignore Slack types suxx
    view_id: view.id,
    // @ts-ignore Slack types suxx
    hash: view.hash,
    view: {
      type: 'modal',
      callback_id: 'view-undeployed-commits-modal',
      title: {
        type: 'plain_text',
        text: `${relevantCommits.length} Undeployed commits`,
      },
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: 'Here are the list of commits that are currently undeployed',
          },
        },
        ...commitBlocks,
        { type: 'actions', elements: [deployButton] },
      ],
    },
  });

  Sentry.withScope(async (scope) => {
    scope.setUser({
      id: body.user.id,
    });
    scope.setContext('Git', {
      base,
      head,
      commits: data.commits.map(({ sha }) => sha),
      relevantCommits: relevantCommits
        .filter(Boolean)
        .map((commit) => commit?.html_url),
    });
  });
}

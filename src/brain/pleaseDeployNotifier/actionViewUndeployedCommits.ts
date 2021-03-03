import * as Sentry from '@sentry/node';

import { GETSENTRY_REPO, OWNER } from '@/config';
import { getBlocksForCommit } from '@api/getBlocksForCommit';
import { getClient } from '@api/github/getClient';
import { getRelevantCommit } from '@api/github/getRelevantCommit';

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
            text:
              ':sentry-loading: Please wait while we fetch undeployed commits',
            emoji: true,
          },
        },
      ],
    },
  });

  // @ts-ignore Slack types suxx
  const [base, head] = payload.value.split(':');
  const github = await getClient(OWNER, GETSENTRY_REPO);

  // Get all getsentry commits between `base` and `head`
  const { data } = await github.repos.compareCommits({
    owner: OWNER,
    repo: GETSENTRY_REPO,
    base,
    head,
  });

  // Get the "relevant" commits from either sentry or getsentry
  // We include `base` here as `compareCommits` does not
  const relevantCommits = await Promise.all(
    data.commits.map(({ sha }) => getRelevantCommit(sha))
  );

  // Generate the Slack blocks for each commit
  const commitBlocks = relevantCommits.flatMap((commit) => [
    ...getBlocksForCommit(commit),
    { type: 'divider' },
  ]);

  // Find the attachments where this action was triggered so that
  // we can find the deploy button that was used
  const attachmentsContainer = body.message.attachments.find(
    ({ id }) => id === body.container.attachment_id
  );
  const actionsBlock = attachmentsContainer?.blocks.find(
    ({ block_id }) => block_id === action.block_id
  );
  const deployButton = actionsBlock?.elements.find(
    ({ action_id }) => action_id === 'freight-deploy'
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

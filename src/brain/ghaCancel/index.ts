import * as Sentry from '@sentry/node';
import {
  matchMessage,
  Middleware,
  SlackEventMiddlewareArgs,
} from '@slack/bolt';

import { GH_ORGS } from '@/config';
import { bolt } from '@/init/slack';

async function handler({ event, say, client }) {
  // eslint-disable-next-line no-useless-escape
  const pattern = /https:\/\/github.com\/([^\/]+)\/([^\/]+)\/pull\/(\d+)/;
  const matches = event.text.match(pattern);

  if (!matches) {
    await say({
      thread_ts: event.ts,
      text: 'Unable to find PR to cancel, please use the full PR URL',
    });
    return;
  }

  const [, orgSlug, repo, pullRequestNumber] = matches;

  const org = GH_ORGS.get(orgSlug);

  const initialMessagePromise = say({
    thread_ts: event.ts,
    text: ':sentry-loading: Cancelling jobs...',
  });

  async function updateMessage(text: string) {
    const message = await initialMessagePromise;
    client.chat.update({
      channel: String(message.channel),
      ts: String(message.ts),
      text,
    });
  }

  let pr;

  try {
    pr = await org.api.pulls.get({
      owner: org.slug,
      repo,
      pull_number: Number(pullRequestNumber),
    });
  } catch (err) {
    Sentry.captureException(err);
    await updateMessage(':x: Unable to find PR');
    return;
  }

  const resp = await org.api.actions.listWorkflowRunsForRepo({
    owner: org.slug,
    repo,
    branch: pr.data.head.ref,
  });

  const workflowsToCancel = resp.data.workflow_runs.filter(
    (run) => run.status !== 'completed'
  );

  if (!workflowsToCancel.length) {
    updateMessage(':shrug: No workflows to cancel');
    return;
  }

  const workflowNames = workflowsToCancel.map((run) => run.name);
  const workflowText = `${
    workflowsToCancel.length
  } workflow: ${workflowNames.join(', ')}`;

  updateMessage(`:sentry-loading: Cancelling ${workflowText}`);

  try {
    await Promise.all(
      workflowsToCancel.map((run) =>
        org.api.actions.cancelWorkflowRun({
          owner: org.slug,
          repo,
          run_id: run.id,
        })
      )
    );

    updateMessage(`:successkid: Cancelled ${workflowText}`);
  } catch (err) {
    updateMessage(`:x: Error cancelling ${workflowText}`);
    Sentry.captureException(err);
  }
}

/*
 * Middleware that filters out non direct messages
 */
function matchDirectMessage(): Middleware<SlackEventMiddlewareArgs<'message'>> {
  return async ({ event, next }) => {
    // @ts-ignore
    if (event.type !== 'message' || event.channel_type !== 'im') {
      return;
    }
    await next!();
  };
}

export function ghaCancel() {
  const pattern = 'gha cancel';

  // TODO(billy): We should have a `createCommand` that binds app_mention + direct message,
  // as well as help text to be used elsewhere
  bolt.event(
    'app_mention',
    // @ts-ignore
    matchMessage(pattern),
    handler
  );

  bolt.message(pattern, matchDirectMessage(), handler);
}

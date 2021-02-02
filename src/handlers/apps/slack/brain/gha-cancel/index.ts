import * as Sentry from '@sentry/node';

import { getClient } from '@api/github/getClient';
import { slackEvents, web } from '@api/slack';

export function ghaCancel() {
  slackEvents.on('app_mention', async (event) => {
    if (!event.text.includes('gha cancel')) {
      return;
    }

    const matches = event.text.match(
      // eslint-disable-next-line
      /gha cancel.*https:\/\/github.com\/([^\/]+)\/([^\/]+)\/pull\/(\d+)/
    );

    if (!matches) {
      web.chat.postMessage({
        channel: event.channel,
        thread_ts: event.ts,
        text: 'Unable to find PR to cancel, please use the full PR URL',
      });
      return;
    }

    const [, owner, repo, pullRequestNumber] = matches;

    const octokit = await getClient(owner, repo);

    const initialMessagePromise = web.chat.postMessage({
      channel: event.channel,
      thread_ts: event.ts,
      text: ':fidget_spinner_right: Cancelling jobs...',
    });

    async function updateMessage(text: string) {
      const message = await initialMessagePromise;
      web.chat.update({
        channel: String(message.channel),
        ts: String(message.ts),
        text,
      });
    }

    let pr;

    try {
      pr = await octokit.pulls.get({
        owner,
        repo,
        pull_number: Number(pullRequestNumber),
      });
    } catch (err) {
      Sentry.captureException(err);
      updateMessage(':x: Unable to find PR');
      return;
    }

    const resp = await octokit.actions.listWorkflowRunsForRepo({
      owner,
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

    updateMessage(`:fidget_spinner_right: Cancelling ${workflowText}`);

    try {
      await Promise.all(
        workflowsToCancel.map((run) =>
          octokit.actions.cancelWorkflowRun({
            owner,
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
  });
}

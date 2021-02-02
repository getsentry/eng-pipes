import { getClient } from '@api/github/getClient';
import { slackEvents } from '@api/slack';

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
      return;
    }

    const [, owner, repo, pullRequestNumber] = matches;

    const octokit = await getClient(owner, repo);
    const pr = await octokit.pulls.get({
      owner,
      repo,
      pull_number: Number(pullRequestNumber),
    });

    const resp = await octokit.actions.listWorkflowRunsForRepo({
      owner,
      repo,
      branch: pr.data.head.ref,
    });

    await Promise.all(
      resp.data.workflow_runs
        .filter((run) => run.status !== 'completed')
        .map((run) =>
          octokit.actions.cancelWorkflowRun({
            owner,
            repo,
            run_id: run.id,
          })
        )
    );
  });
}

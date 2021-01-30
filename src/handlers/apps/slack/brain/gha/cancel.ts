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

    const pr = await github.pulls.get({
      owner,
      repo,
      pull_number: Number(pullRequestNumber),
    });

    const resp = await github.actions.listWorkflowRunsForRepo({
      owner,
      repo,
      branch: pr.data.head.ref,
    });

    await Promise.all(
      resp.data.workflow_runs
        .filter((run) => run.status !== 'completed')
        .map((run) =>
          github.actions.cancelWorkflowRun({
            owner,
            repo,
            run_id: run.id,
          })
        )
    );
  });
}

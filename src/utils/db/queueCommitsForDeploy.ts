import { db } from '.';

import { CompareCommits } from '~/types';

/**
 * We want to save the list of commits that are currently queued to be deployed
 * so that we can later look up if it's queued given a sha
 */
export async function queueCommitsForDeploy(
  commits: CompareCommits['commits']
) {
  if (commits.length === 0) {
    return;
  }

  const { sha: head_sha } = commits[commits.length - 1];
  return await db('queued_commits').insert(
    commits.map((commit) => ({
      head_sha,
      sha: commit.sha,
      data: JSON.stringify(commit),
    }))
  );
}

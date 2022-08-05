import { ClientType } from '@/api/github/clientType';
import { GETSENTRY_REPO, OWNER } from '@/config';
import { getClient } from '@api/github/getClient';

import { db } from '.';

export async function getLatestDeploy(app_name: string) {
  return await db
    .select('*')
    .from('deploys')
    .where({
      status: 'finished',
      environment: 'production',
      app_name,
    })
    .orderBy('finished_at', 'desc')
    .first();
}

/**
 * Gets the latest deploy (based on commit sha) between 2 freight projects.
 *
 * This will fetch the latest deploy between two Freight projects, and then use
 * GitHub API to compare the two SHAs to determine the most *recent* commit SHA.
 */
export async function getLatestDeployBetweenProjects(
  projectA: string = 'getsentry-backend',
  projectB: string = 'getsentry-frontend'
) {
  const [deployA, deployB] = await Promise.all(
    [projectA, projectB].map(getLatestDeploy)
  );

  if (!deployA && !deployB) {
    return null;
  }

  if (!deployA || !deployB) {
    // If exactly one project does not have a deploy, return any deploys we have
    return deployA ?? deployB;
  }

  const octokit = await getClient(ClientType.App, OWNER);

  const { data } = await octokit.repos.compareCommits({
    owner: OWNER,
    repo: GETSENTRY_REPO,
    base: deployA.sha,
    head: deployB.sha,
  });

  // Can be ahead, behind, identical, diverged
  if (data.status === 'behind') {
    // base is newer than head
    return deployA;
  } else if (data.status === 'ahead') {
    // base is older than head
    return deployB;
  } else if (data.status === 'identical') {
    // Shouldn't matter which deploy because the commits are identical
    // Picking the first arg
    return deployA;
  }

  // This shouldn't happen
  throw new Error('Commits are diverged from each other.');
}

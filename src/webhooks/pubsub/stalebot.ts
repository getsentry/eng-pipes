import { Octokit } from '@octokit/rest';
import moment from 'moment-timezone';

import { ClientType } from '@/api/github/clientType';
import { OWNER, STALE_LABEL } from '@/config';
import { getClient } from '@api/github/getClient';

const GH_API_PER_PAGE = 100;
const DAYS_BEFORE_STALE = 21;
const DAYS_BEFORE_CLOSE = 7;

const staleStatusUpdater = async (
  repo: string,
  issues,
  octokit: Octokit,
  now: moment.Moment
) => {
  issues.forEach(async (issue) => {
    const isPullRequest = issue.pull_request ? true : false;
    const issueHasStaleLabel = issue.labels.some(
      (label) => typeof label !== 'string' && label.name === STALE_LABEL
    );
    if (issueHasStaleLabel) {
      if (now.diff(issue.updated_at, 'days') >= DAYS_BEFORE_CLOSE) {
        // Interestingly enough, this api works for both issues and pull requests
        await octokit.issues.update({
          owner: OWNER,
          repo: repo,
          issue_number: issue.number,
          state: 'closed',
        });
      } else if (now.diff(issue.updated_at, 'days') < DAYS_BEFORE_CLOSE) {
        await octokit.issues.removeLabel({
          owner: OWNER,
          repo: repo,
          issue_number: issue.number,
          name: STALE_LABEL,
        });
      }
    } else {
      if (now.diff(issue.updated_at, 'days') >= DAYS_BEFORE_STALE) {
        await octokit.issues.addLabels({
          owner: OWNER,
          repo: repo,
          issue_number: issue.number,
          labels: [STALE_LABEL],
        });
        await octokit.issues.createComment({
          owner: OWNER,
          repo: repo,
          issue_number: issue.number,
          body: `This ${
            isPullRequest ? 'pull request' : 'issue'
          } has gone three weeks without activity. In another week, I will close it.

But! If you comment or otherwise update it, I will reset the clock, and if you label it \`Status: Backlog\` or \`Status: In Progress\`, I will leave it alone ... forever!

----

"A weed is but an unloved flower." ― _Ella Wheeler Wilcox_ 🥀`,
        });
      }
    }
  });
};

export const triggerStaleBot = async (repos: string[]) => {
  const octokit = await getClient(ClientType.App, OWNER);
  const now = moment().utc();

  // Get all open issues and pull requests
  repos.forEach(async (repo: string) => {
    const issues = await octokit.paginate(octokit.issues.listForRepo, {
      owner: OWNER,
      repo,
      state: 'open',
      // labels: WAITING_FOR_COMMUNITY_LABEL,
      per_page: GH_API_PER_PAGE,
    });
    await staleStatusUpdater(repo, issues, octokit, now);
  });
};

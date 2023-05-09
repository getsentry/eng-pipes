import { Octokit } from '@octokit/rest';
import moment from 'moment-timezone';

import { OWNER, STALE_LABEL } from '@/config';

const GH_API_PER_PAGE = 100;
const DAYS_BEFORE_STALE = 21;
const DAYS_BEFORE_CLOSE = 7;

const staleStatusUpdater = async (
  repo: string,
  issues,
  octokit: Octokit,
  now: moment.Moment
) => {
  await Promise.all(
    issues.map((issue) => {
      const isPullRequest = issue.pull_request ? true : false;
      const issueHasStaleLabel = issue.labels.some(
        (label) => label === STALE_LABEL || label.name === STALE_LABEL
      );
      if (issueHasStaleLabel) {
        if (now.diff(issue.updated_at, 'days') >= DAYS_BEFORE_CLOSE) {
          // Interestingly enough, this api works for both issues and pull requests
          return octokit.issues.update({
            owner: OWNER,
            repo: repo,
            issue_number: issue.number,
            state: 'closed',
          });
        } else if (now.diff(issue.updated_at, 'days') < DAYS_BEFORE_CLOSE) {
          return octokit.issues.removeLabel({
            owner: OWNER,
            repo: repo,
            issue_number: issue.number,
            name: STALE_LABEL,
          });
        }
        return Promise.resolve();
      } else {
        if (now.diff(issue.updated_at, 'days') >= DAYS_BEFORE_STALE) {
          return Promise.all([
            octokit.issues.addLabels({
              owner: OWNER,
              repo: repo,
              issue_number: issue.number,
              labels: [STALE_LABEL],
            }),
            octokit.issues.createComment({
              owner: OWNER,
              repo: repo,
              issue_number: issue.number,
              body: `This ${
                isPullRequest ? 'pull request' : 'issue'
              } has gone three weeks without activity. In another week, I will close it.

But! If you comment or otherwise update it, I will reset the clock, and if you label it \`Status: Backlog\` or \`Status: In Progress\`, I will leave it alone ... forever!

----

"A weed is but an unloved flower." ― _Ella Wheeler Wilcox_ 🥀`,
            }),
          ]);
        }
        return Promise.resolve();
      }
    })
  );
};

export const triggerStaleBot = async (
  repos: string[],
  octokit: Octokit,
  now: moment.Moment
) => {
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

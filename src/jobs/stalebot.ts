import moment from 'moment-timezone';

import {
  STALE_LABEL,
  WAITING_FOR_COMMUNITY_LABEL,
  WORK_IN_PROGRESS_LABEL,
} from '@/config';
import { GitHubOrg } from '@api/github/org';

const GH_API_PER_PAGE = 100;
const DAYS_BEFORE_STALE = 21;
const DAYS_BEFORE_CLOSE = 7;

const staleStatusUpdater = async (
  org: GitHubOrg,
  repo: string,
  issues,
  now: moment.Moment
) => {
  await Promise.all(
    issues.map((issue) => {
      // Only pull requests will have issue.merge_commit_sha property
      const isPullRequest = issue.merge_commit_sha ? true : false;
      if (now.diff(issue.updated_at, 'days') >= DAYS_BEFORE_STALE) {
        return Promise.all([
          org.api.issues.addLabels({
            owner: org.slug,
            repo: repo,
            issue_number: issue.number,
            labels: [STALE_LABEL],
          }),
          org.api.issues.createComment({
            owner: org.slug,
            repo: repo,
            issue_number: issue.number,
            body: `This ${
              isPullRequest ? 'pull request' : 'issue'
            } has gone three weeks without activity. In another week, I will close it.

But! If you comment or otherwise update it, I will reset the clock, and if you ${
              isPullRequest
                ? 'add the label `WIP`'
                : 'remove the label `Waiting for: Community`'
            }, I will leave it alone ${
              isPullRequest ? 'unless `WIP` is removed ' : ''
            }... forever!

----

"A weed is but an unloved flower." ― _Ella Wheeler Wilcox_ 🥀`,
          }),
        ]);
      }
      return Promise.resolve();
    })
  );
};

const closeStaleIssues = async (
  org: GitHubOrg,
  repo: string,
  staleIssues,
  now: moment.Moment
) => {
  await Promise.all(
    staleIssues.map((issue) => {
      const isPullRequest = issue.pull_request ? true : false;
      // Only handle issues
      if (isPullRequest) {
        return Promise.resolve();
      }
      const issueHasWaitingForCommunityLabel = issue.labels.some(
        (label) =>
          label === WAITING_FOR_COMMUNITY_LABEL ||
          label.name === WAITING_FOR_COMMUNITY_LABEL
      );
      if (
        issueHasWaitingForCommunityLabel &&
        now.diff(issue.updated_at, 'days') >= DAYS_BEFORE_CLOSE
      ) {
        // Interestingly enough, this api works for both issues and pull requests
        return org.api.issues.update({
          owner: org.slug,
          repo: repo,
          issue_number: issue.number,
          state_reason: 'not_planned',
          state: 'closed',
        });
      } else if (!issueHasWaitingForCommunityLabel) {
        // If issue is no longer waiting for community, it shouldn't be marked as stale
        return org.api.issues.removeLabel({
          owner: org.slug,
          repo: repo,
          issue_number: issue.number,
          name: STALE_LABEL,
        });
      }
      return Promise.resolve();
    })
  );
};

const closeStalePullRequests = async (
  org: GitHubOrg,
  repo: string,
  stalePullRequests,
  now: moment.Moment
) => {
  const stalePullRequestUpdates = stalePullRequests.map(async (pullRequest) => {
    // Check if there was non-bot activity after we last labeled it stale
    const events = await org.api.paginate(org.api.issues.listEvents, {
      owner: org.slug,
      repo: repo,
      issue_number: pullRequest.number,
      per_page: 100,
    });

    const lastEvent = events[events.length - 1];

    // If the last event was not a stale label event, we can remove the stale label and reset the clock for this PR
    if (
      lastEvent?.event !== 'labeled' ||
      lastEvent.label?.name !== STALE_LABEL
    ) {
      return org.api.issues.removeLabel({
        owner: org.slug,
        repo: repo,
        issue_number: pullRequest.number,
        name: STALE_LABEL,
      });
    }

    // Otherwise, if it has been under a week since we added the stale label, we do nothing.
    if (now.diff(moment(lastEvent.created_at), 'days') < DAYS_BEFORE_CLOSE) {
      return Promise.resolve();
    }

    // If it has been over a week since we added the stale label, we close the PR
    return org.api.issues.update({
      owner: org.slug,
      repo: repo,
      issue_number: pullRequest.number,
      state_reason: 'not_planned',
      state: 'closed',
    });
  });
  await Promise.all(stalePullRequestUpdates);
};

export const triggerStaleBot = async (org: GitHubOrg, now: moment.Moment) => {
  // Get all open issues and pull requests that are Waiting for Community
  await Promise.all(
    org.repos.all.map(
      async (repo: string) => {
        const issuesWaitingForCommunity = await org.api.paginate(
          org.api.issues.listForRepo,
          {
            owner: org.slug,
            repo,
            state: 'open',
            labels: WAITING_FOR_COMMUNITY_LABEL,
            per_page: GH_API_PER_PAGE,
          }
        );
        const staleIssues = await org.api.paginate(org.api.issues.listForRepo, {
          owner: org.slug,
          repo,
          state: 'open',
          labels: STALE_LABEL,
          per_page: GH_API_PER_PAGE,
        });
        await staleStatusUpdater(org, repo, issuesWaitingForCommunity, now);
        await closeStaleIssues(org, repo, staleIssues, now);
      },
      org.repos.withRouting.map(async (repo: string) => {
        const pullRequests = await org.api.paginate(org.api.pulls.list, {
          owner: org.slug,
          repo,
          state: 'open',
          per_page: GH_API_PER_PAGE,
        });
        const pullRequestsToCheck = pullRequests.filter(
          (pullRequest) =>
            !pullRequest.labels.some(
              (label) => label.name?.toUpperCase() === WORK_IN_PROGRESS_LABEL
            )
        );
        // Unfortunately, octokit doesn't allow us to filter by labels when
        // sending a GET request for pull requests, so we need to do this manually.
        const stalePullRequests = pullRequestsToCheck.filter((pullRequest) =>
          pullRequest.labels.some((label) => label.name === STALE_LABEL)
        );
        const activePullRequests = pullRequestsToCheck.filter(
          (pullRequest) => !stalePullRequests.includes(pullRequest)
        );
        await staleStatusUpdater(org, repo, activePullRequests, now);
        await closeStalePullRequests(org, repo, stalePullRequests, now);
      })
    )
  );
};

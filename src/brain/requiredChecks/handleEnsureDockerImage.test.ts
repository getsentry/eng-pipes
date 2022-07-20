import { createGitHubEvent } from '@test/utils/github';

import { buildServer } from '@/buildServer';
import { Fastify } from '@/types';
import { ClientType, getClient } from '@api/github/getClient';
import { bolt } from '@api/slack';

import { rerunFlakeyJobs } from './rerunFlakeyJobs';
import { requiredChecks } from '.';

jest.mock('./rerunFlakeyJobs', () => ({
  rerunFlakeyJobs: jest.fn(async () => ({ isRestarting: false })),
}));

describe('requiredChecks', function () {
  let fastify: Fastify;
  let octokit;
  const postMessage = bolt.client.chat.postMessage as jest.Mock;

  beforeEach(async function () {
    fastify = await buildServer(false);
    await requiredChecks();
    octokit = await getClient(ClientType.App, 'getsentry');
  });

  afterEach(async function () {
    fastify.close();
  });

  it('restarts when `ensure docker image` job fails', async function () {
    await createGitHubEvent(fastify, 'check_run', {
      check_run: {
        id: 5027131066,
        name: 'ensure docker image (3.8.12)',
        node_id: 'CR_kwDOAC60vc8AAAABK6Puug',
        head_sha: 'd68ef079941430eb920d8a22f06e315752d83dc9',
        external_id: 'ba69febf-1cba-5c1d-ffda-df44a67d2a7d',
        url: 'https://api.github.com/repos/getsentry/getsentry/check-runs/5027131066',
        html_url:
          'https://github.com/getsentry/getsentry/runs/5027131066?check_suite_focus=true',
        details_url:
          'https://github.com/getsentry/getsentry/runs/5027131066?check_suite_focus=true',
        status: 'completed',
        conclusion: 'failure',
        started_at: '2022-02-01T19:49:34Z',
        completed_at: '2022-02-01T20:03:47Z',
        output: {
          title: 'ensure docker image (3.8.12)',
          summary: 'There are 1 failures, 0 warnings, and 0 notices.',
          text: null,
          annotations_count: 1,
          annotations_url:
            'https://api.github.com/repos/getsentry/getsentry/check-runs/5027131066/annotations',
        },
        check_suite: { id: 5141574370 },
        app: {
          id: 15368,
          slug: 'github-actions',
          node_id: 'MDM6QXBwMTUzNjg=',
          owner: {
            login: 'github',
            id: 9919,
            node_id: 'MDEyOk9yZ2FuaXphdGlvbjk5MTk=',
            avatar_url: 'https://avatars.githubusercontent.com/u/9919?v=4',
            gravatar_id: '',
            url: 'https://api.github.com/users/github',
            html_url: 'https://github.com/github',
            followers_url: 'https://api.github.com/users/github/followers',
            following_url:
              'https://api.github.com/users/github/following{/other_user}',
            gists_url: 'https://api.github.com/users/github/gists{/gist_id}',
            starred_url:
              'https://api.github.com/users/github/starred{/owner}{/repo}',
            subscriptions_url:
              'https://api.github.com/users/github/subscriptions',
            organizations_url: 'https://api.github.com/users/github/orgs',
            repos_url: 'https://api.github.com/users/github/repos',
            events_url: 'https://api.github.com/users/github/events{/privacy}',
            received_events_url:
              'https://api.github.com/users/github/received_events',
            type: 'Organization',
            site_admin: false,
          },
          name: 'GitHub Actions',
          description: 'Automate your workflow from idea to production',
          external_url: 'https://help.github.com/en/actions',
          html_url: 'https://github.com/apps/github-actions',
          created_at: '2018-07-30T09:30:17Z',
          updated_at: '2019-12-10T19:04:12Z',
          permissions: {
            actions: 'write',
            administration: 'read',
            checks: 'write',
            contents: 'write',
            deployments: 'write',
            discussions: 'write',
            issues: 'write',
            metadata: 'read',
            organization_packages: 'write',
            packages: 'write',
            pages: 'write',
            pull_requests: 'write',
            repository_hooks: 'write',
            repository_projects: 'write',
            security_events: 'write',
            statuses: 'write',
            vulnerability_alerts: 'read',
          },
          events: [
            'branch_protection_rule',
            'check_run',
            'check_suite',
            'create',
            'delete',
            'deployment',
            'deployment_status',
            'discussion',
            'discussion_comment',
            'fork',
            'gollum',
            'issues',
            'issue_comment',
            'label',
            'milestone',
            'page_build',
            'project',
            'project_card',
            'project_column',
            'public',
            'pull_request',
            'pull_request_review',
            'pull_request_review_comment',
            'push',
            'registry_package',
            'release',
            'repository',
            'repository_dispatch',
            'status',
            'watch',
            'workflow_dispatch',
            'workflow_run',
          ],
        },
        pull_requests: [],
      },
      repository: {
        full_name: 'getsentry/getsentry',
      },
    });

    // No messages get posted, should only re-run
    expect(postMessage).toHaveBeenCalledTimes(0);

    expect(rerunFlakeyJobs).toHaveBeenCalledWith([5027131066]);
  });
});

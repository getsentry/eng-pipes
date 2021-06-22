import { createGitHubEvent } from '@test/utils/createGitHubEvent';

import { buildServer } from '@/buildServer';
import { Fastify } from '@/types';
import { githubEvents } from '@api/github';
import { getClient } from '@api/github/getClient';
import { db } from '@utils/db';

import { timeToTriage } from '.';

describe('timeToTriage', function () {
  let fastify: Fastify;
  let octokit;

  beforeAll(async function () {
    await db.migrate.latest();
  });

  afterAll(async function () {
    await db.destroy();
  });

  beforeEach(async function () {
    fastify = await buildServer(false);
    await timeToTriage();
    octokit = await getClient('Enterprise');
  });

  afterEach(async function () {
    fastify.close();
    octokit.issues._labels = new Set([]);
    octokit.issues.removeLabel.mockClear();
  });

  // Helpers

  function untriage() {
    octokit.issues._labels.add('Status: Untriaged');
  }

  function expectUntriaged() {
    expect(octokit.issues._labels).toStrictEqual(
      new Set(['Status: Untriaged'])
    );
  }

  function expectTriaged() {
    expect(octokit.issues._labels).toStrictEqual(new Set([]));
  }

  function expectRemoval() {
    expect(octokit.issues.removeLabel).toBeCalled();
  }

  function expectNoRemoval() {
    expect(octokit.issues.removeLabel).not.toBeCalled();
  }

  function makePayload(repo: ?string, label: ?string, sender: ?string) {
    repo = repo || 'test-ttt-simple';

    const labels = [];
    for (const name of octokit.issues._labels) {
      labels.push({ name });
    }

    const payload = {
      sender: { login: sender || 'Skywalker' }, // default to external user
      repository: {
        name: repo,
        owner: { login: 'Enterprise' },
      },
      issue: { labels: labels }, // mix in labels stored in mock
    };

    if (label) {
      payload.label = { name: label };
    }

    return payload;
  }

  async function createIssue(repo: ?string, username: ?string) {
    await createGitHubEvent(
      fastify,
      'issues.opened',
      makePayload(repo, undefined, username)
    );
  }

  async function addLabel(label: string, repo: ?string) {
    await createGitHubEvent(
      fastify,
      'issues.labeled',
      makePayload(repo, label)
    );
  }

  // Test cases

  // adding

  it('adds `Status: Untriaged` to new issues', async function () {
    await createIssue();
    expectUntriaged();
  });

  it('skips adding `Status: Untriaged` in unmentioned repos', async function () {
    await createIssue('other-repo');
    expectTriaged();
  });

  it('skips adding `Status: Untriaged` for internal users', async function () {
    await createIssue(undefined, 'Picard');
    expectTriaged();
  });

  // removing

  it('removes `Status: Untriaged` when adding other labels', async function () {
    untriage();
    await addLabel('Cheeseburger Pie');
    expectTriaged();
    expectRemoval();
  });

  it('skips removing `Status: Untriaged` when its not present', async function () {
    await addLabel('Cheeseburger Pie');
    expectTriaged();
    expectNoRemoval();
  });

  it('skips removing `Status: Untriaged` when adding `Status: Untriaged`', async function () {
    untriage();
    await addLabel('Status: Untriaged');
    expectUntriaged();
    expectNoRemoval();
  });

  it('skips removing `Status: Untriaged` in unmentioned repos', async function () {
    untriage();
    await addLabel('Cheeseburger Pie', 'other-repo');
    expectUntriaged();
    expectNoRemoval();
  });
});

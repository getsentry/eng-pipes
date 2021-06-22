import { createGitHubEvent } from '@test/utils/createGitHubEvent';

import { buildServer } from '@/buildServer';
import { UNTRIAGED_LABEL } from '@/config';
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
    octokit.issues.addLabels.mockClear();
    octokit.issues.removeLabel.mockClear();
  });

  // Helpers

  function untriage() {
    octokit.issues._labels.add(UNTRIAGED_LABEL);
  }

  function expectUntriaged() {
    expect(octokit.issues._labels).toContain(UNTRIAGED_LABEL);
  }

  function expectTriaged() {
    expect(octokit.issues._labels).not.toContain(UNTRIAGED_LABEL);
  }

  function expectRemoval() {
    expect(octokit.issues.removeLabel).toBeCalled();
  }

  function expectNoRemoval() {
    expect(octokit.issues.removeLabel).not.toBeCalled();
  }

  function expectAdding() {
    expect(octokit.issues.addLabels).toBeCalled();
  }

  function expectNoAdding() {
    expect(octokit.issues.addLabels).not.toBeCalled();
  }

  function makePayload(repo: ?string, label: ?string, sender: ?string) {
    repo = repo || 'test-ttt-simple';

    const labels = Array.from(octokit.issues._labels, (name) => ({ name }));
    const payload = {
      sender: { login: sender || 'Skywalker' }, // default to external user
      repository: {
        name: repo,
        owner: { login: 'Enterprise' },
      },
      issue: { labels }, // mix in labels stored in mock
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
    expectAdding();
  });

  it('skips adding `Status: Untriaged` in untracked repos', async function () {
    await createIssue('other-repo');
    expectTriaged();
    expectNoAdding();
  });

  it('skips adding `Status: Untriaged` when added during creation', async function () {
    untriage();
    await createIssue(undefined, 'Picard');
    expectUntriaged();
    expectNoAdding();
  });

  it('skips adding `Status: Untriaged` for internal users', async function () {
    await createIssue(undefined, 'Picard');
    expectTriaged();
    expectNoAdding();
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
    await addLabel(UNTRIAGED_LABEL);
    expectUntriaged();
    expectNoRemoval();
  });

  it('skips removing `Status: Untriaged` in untracked repos', async function () {
    untriage();
    await addLabel('Cheeseburger Pie', 'other-repo');
    expectUntriaged();
    expectNoRemoval();
  });
});

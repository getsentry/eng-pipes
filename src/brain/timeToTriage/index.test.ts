import { createGitHubEvent } from '@test/utils/github';

import { buildServer } from '@/buildServer';
import { UNTRIAGED_LABEL } from '@/config';
import { Fastify } from '@/types';
import { defaultErrorHandler, githubEvents } from '@api/github';
import { MockOctokitError } from '@api/github/__mocks__/mockError';
import { getClient } from '@api/github/getClient';
import { db } from '@utils/db';

import { timeToTriage } from '.';

describe('timeToTriage', function () {
  let fastify: Fastify;
  let octokit;
  const errors = jest.fn();

  beforeAll(async function () {
    await db.migrate.latest();
    githubEvents.removeListener('error', defaultErrorHandler);
    githubEvents.onError(errors);
  });

  afterAll(async function () {
    githubEvents.removeListener('error', errors);
    githubEvents.onError(defaultErrorHandler);
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
    errors.mockClear();
  });

  // Helpers

  function triage() {
    octokit.issues._labels.delete(UNTRIAGED_LABEL);
  }

  function untriage() {
    octokit.issues._labels.add(UNTRIAGED_LABEL);
  }

  function removeThrows(status) {
    octokit.issues.removeLabel.mockImplementationOnce(async () => {
      if (status === 404) {
        triage(); // pretend a previous attempt succeeded
      }
      throw new MockOctokitError(status);
    });
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

  // Expectations

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

  function expectError(status) {
    // TODO: Refactor suite to unit test the handlers so we can use jest expect.toThrow.
    expect(errors.mock.calls[0][0].errors[0].status).toBe(status);
  }

  function expectNoError() {
    expect(errors).not.toHaveBeenCalled();
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

  it('gracefully handles race with other remover of `Status: Untriaged`', async function () {
    untriage();
    removeThrows(404);
    await addLabel('Cheeseburger Pie');
    expectNoError();
    expectTriaged();
    expectRemoval();
  });

  it("doesn't handle non-404 errors when removing `Status: Untriaged`", async function () {
    untriage();
    removeThrows(400);
    await addLabel('Cheeseburger Pie');
    expectError(400);
    expectUntriaged();
    expectRemoval();
  });
});

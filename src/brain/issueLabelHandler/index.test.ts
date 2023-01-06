import { createGitHubEvent } from '@test/utils/github';

import { buildServer } from '@/buildServer';
import { UNROUTED_LABEL, UNTRIAGED_LABEL } from '@/config';
import { Fastify } from '@/types';
import { defaultErrorHandler, githubEvents } from '@api/github';
import { MockOctokitError } from '@api/github/__mocks__/mockError';
import { ClientType } from '@api/github/clientType';
import { getClient } from '@api/github/getClient';
import * as businessHourFunctions from '@utils/businessHours';
import { db } from '@utils/db';

import { issueLabelHandler } from '.';

describe('issueLabelHandler', function () {
  let fastify: Fastify;
  let octokit;
  const errors = jest.fn();

  beforeAll(async function () {
    await db.migrate.latest();
    githubEvents.removeListener('error', defaultErrorHandler);
    githubEvents.onError(errors);
    jest
      .spyOn(businessHourFunctions, 'calculateSLOViolationRoute')
      .mockReturnValue('2022-12-20T00:00:00.000Z');
    jest
      .spyOn(businessHourFunctions, 'calculateSLOViolationTriage')
      .mockReturnValue('2022-12-21T00:00:00.000Z');
  });

  afterAll(async function () {
    // @ts-expect-error
    githubEvents.removeListener('error', errors);
    githubEvents.onError(defaultErrorHandler);
    await db.destroy();
  });

  beforeEach(async function () {
    fastify = await buildServer(false);
    await issueLabelHandler();
    octokit = await getClient(ClientType.App, 'Enterprise');
  });

  afterEach(async function () {
    fastify.close();
    octokit.issues._labels = new Set([]);
    octokit.issues.addLabels.mockClear();
    octokit.issues.removeLabel.mockClear();
    octokit.issues._comments = [];
    octokit.issues.createComment.mockClear();
    octokit.teams.getByName.mockClear();
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

  function makePayload(
    repo?: string,
    label?: string,
    sender?: string,
    labelDescription?: string,
    state?: string,
    author_association?: string
  ) {
    repo = repo || 'test-ttt-simple';
    state = state || 'open';
    author_association = author_association || 'NONE';

    const labels = Array.from(octokit.issues._labels, (name) => ({ name }));
    const payload: Record<string, any> = {
      sender: { login: sender || 'Skywalker' }, // default to external user
      repository: {
        name: repo,
        owner: { login: 'Enterprise' },
      },
      issue: { state, labels, author_association }, // mix in labels stored in mock
    };

    if (label) {
      payload.label = { name: label, description: labelDescription };
    }
    return payload;
  }

  async function createIssue(
    repo?: string,
    username?: string,
    author_association?: string
  ) {
    await createGitHubEvent(
      fastify,
      // @ts-expect-error
      'issues.opened',
      makePayload(
        repo,
        undefined,
        username,
        undefined,
        undefined,
        author_association
      )
    );
  }

  async function addLabel(
    label: string,
    repo?: string,
    labelDescription?: string,
    state?: string,
    author_association?: string
  ) {
    await createGitHubEvent(
      fastify,
      // @ts-expect-error
      'issues.labeled',
      makePayload(
        repo,
        label,
        undefined,
        labelDescription,
        state,
        author_association
      )
    );
    octokit.issues.addLabels({ labels: [label] });
  }

  // Expectations

  function expectUnrouted() {
    expect(octokit.issues._labels).toContain(UNROUTED_LABEL);
  }

  function expectRouted() {
    expect(octokit.issues._labels).not.toContain(UNROUTED_LABEL);
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

  function expectError(status) {
    // TODO: Refactor suite to unit test the handlers so we can use jest expect.toThrow.
    expect(errors.mock.calls[0][0].errors[0].status).toBe(status);
  }

  function expectNoError() {
    expect(errors).not.toHaveBeenCalled();
  }

  // Test cases
  describe('triage test cases', function () {
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

  describe('[routing](https://open.sentry.io/triage/#2-route) test cases', function () {
    it('skips routing if issue is created by collaborator', async function () {
      await createIssue('sentry-docs', 'Picard', 'COLLABORATOR');
      await addLabel(
        'Team: Test',
        'sentry-docs',
        undefined,
        undefined,
        'COLLABORATOR'
      );
      expect(octokit.issues._comments).toEqual([]);
    });

    it('skips routing if issue is created by owner', async function () {
      await createIssue('sentry-docs', 'Picard', 'OWNER');
      await addLabel(
        'Team: Test',
        'sentry-docs',
        undefined,
        undefined,
        'OWNER'
      );
      expect(octokit.issues._comments).toEqual([]);
    });

    it('skips routing if issue is created by owner', async function () {
      await createIssue('sentry-docs', 'Picard', 'MEMBER');
      await addLabel(
        'Team: Test',
        'sentry-docs',
        undefined,
        undefined,
        'MEMBER'
      );
      expect(octokit.issues._comments).toEqual([]);
    });

    it('skips routing if issue is created by owner', async function () {
      await createIssue('sentry-docs', 'Picard', 'CONTRIBUTOR');
      await addLabel(
        'Team: Test',
        'sentry-docs',
        undefined,
        undefined,
        'CONTRIBUTOR'
      );
      expect(octokit.issues._comments).toEqual([]);
    });

    it('adds `Status: Unrouted` to new issues', async function () {
      await createIssue('sentry-docs');
      expectUnrouted();
      expect(octokit.issues._comments).toEqual([
        'Assigning to @getsentry/support for [routing](https://open.sentry.io/triage/#2-route), due by **<time datetime=2022-12-20T00:00:00.000Z>Tue Dec 20 2022 00:00:00 GMT+0000</time>**. ⏲️',
      ]);
    });

    it('skips adding `Status: Unrouted` in untracked repos', async function () {
      await createIssue('Pizza Sandwich');
      expectRouted();
      expect(octokit.issues._comments).toEqual([]);
    });

    it('removes unrouted label when team label is added', async function () {
      await createIssue('sentry-docs');
      await addLabel('Team: Test', 'sentry-docs');
      expectUntriaged();
      expectRouted();
      expect(octokit.issues._comments).toEqual([
        'Assigning to @getsentry/support for [routing](https://open.sentry.io/triage/#2-route), due by **<time datetime=2022-12-20T00:00:00.000Z>Tue Dec 20 2022 00:00:00 GMT+0000</time>**. ⏲️',
        'Routing to @getsentry/test for [triage](https://develop.sentry.dev/processing-tickets/#3-triage), due by **<time datetime=2022-12-21T00:00:00.000Z>Wed Dec 21 2022 00:00:00 GMT+0000</time>**. ⏲️',
      ]);
    });

    it('does not remove unrouted label when label is added that is not a team label', async function () {
      await createIssue('sentry-docs');
      await addLabel('Status: Needs More Information', 'sentry-docs');
      expectUnrouted();
      expect(octokit.issues._comments).toEqual([
        'Assigning to @getsentry/support for [routing](https://open.sentry.io/triage/#2-route), due by **<time datetime=2022-12-20T00:00:00.000Z>Tue Dec 20 2022 00:00:00 GMT+0000</time>**. ⏲️',
      ]);
    });

    it('should try to use label description if team label name does not exist', async function () {
      await createIssue('sentry-docs');
      await addLabel('Team: Does Not Exist', 'sentry-docs', 'test');
      expectUntriaged();
      expect(octokit.issues._comments).toEqual([
        'Assigning to @getsentry/support for [routing](https://open.sentry.io/triage/#2-route), due by **<time datetime=2022-12-20T00:00:00.000Z>Tue Dec 20 2022 00:00:00 GMT+0000</time>**. ⏲️',
        'Routing to @getsentry/test for [triage](https://develop.sentry.dev/processing-tickets/#3-triage), due by **<time datetime=2022-12-21T00:00:00.000Z>Wed Dec 21 2022 00:00:00 GMT+0000</time>**. ⏲️',
      ]);
    });

    it('should default to route to open source team if team does not exist', async function () {
      await createIssue('sentry-docs');
      await addLabel('Team: Does Not Exist', 'sentry-docs');
      expectUntriaged();
      expectRouted();
      expect(octokit.issues._comments).toEqual([
        'Assigning to @getsentry/support for [routing](https://open.sentry.io/triage/#2-route), due by **<time datetime=2022-12-20T00:00:00.000Z>Tue Dec 20 2022 00:00:00 GMT+0000</time>**. ⏲️',
        'Failed to route to Team: Does Not Exist. Defaulting to @getsentry/open-source for [triage](https://develop.sentry.dev/processing-tickets/#3-triage), due by **<time datetime=2022-12-21T00:00:00.000Z>Wed Dec 21 2022 00:00:00 GMT+0000</time>**. ⏲️',
      ]);
    });

    it('removes previous Team labels when re[routing](https://open.sentry.io/triage/#2-route)', async function () {
      await createIssue('sentry-docs');
      await addLabel('Team: Test', 'sentry-docs');
      expectUntriaged();
      expectRouted();
      await addLabel('Team: Rerouted', 'sentry-docs');
      expect(octokit.issues._labels).toContain('Team: Rerouted');
      expect(octokit.issues._labels).not.toContain('Team: Test');
      expect(octokit.issues._comments).toEqual([
        'Assigning to @getsentry/support for [routing](https://open.sentry.io/triage/#2-route), due by **<time datetime=2022-12-20T00:00:00.000Z>Tue Dec 20 2022 00:00:00 GMT+0000</time>**. ⏲️',
        'Routing to @getsentry/test for [triage](https://develop.sentry.dev/processing-tickets/#3-triage), due by **<time datetime=2022-12-21T00:00:00.000Z>Wed Dec 21 2022 00:00:00 GMT+0000</time>**. ⏲️',
        'Routing to @getsentry/rerouted for [triage](https://develop.sentry.dev/processing-tickets/#3-triage), due by **<time datetime=2022-12-21T00:00:00.000Z>Wed Dec 21 2022 00:00:00 GMT+0000</time>**. ⏲️',
      ]);
    });

    it('should not reroute if Status: Backlog is exists on issue', async function () {
      await createIssue('sentry-docs');
      await addLabel('Team: Test', 'sentry-docs');
      expectUntriaged();
      expectRouted();
      await addLabel('Status: Backlog', 'sentry-docs');
      await addLabel('Team: Rerouted', 'sentry-docs');
      expect(octokit.issues._labels).toContain('Team: Rerouted');
      expect(octokit.issues._labels).toContain('Team: Test');
      expect(octokit.issues._comments).toEqual([
        'Assigning to @getsentry/support for [routing](https://open.sentry.io/triage/#2-route), due by **<time datetime=2022-12-20T00:00:00.000Z>Tue Dec 20 2022 00:00:00 GMT+0000</time>**. ⏲️',
        'Routing to @getsentry/test for [triage](https://develop.sentry.dev/processing-tickets/#3-triage), due by **<time datetime=2022-12-21T00:00:00.000Z>Wed Dec 21 2022 00:00:00 GMT+0000</time>**. ⏲️',
      ]);
    });

    it('should not reroute if Status: In Progress exists on issue', async function () {
      await createIssue('sentry-docs');
      await addLabel('Team: Test', 'sentry-docs');
      expectUntriaged();
      expectRouted();
      await addLabel('Status: In Progress', 'sentry-docs');
      await addLabel('Team: Rerouted', 'sentry-docs');
      expect(octokit.issues._labels).toContain('Team: Rerouted');
      expect(octokit.issues._labels).toContain('Team: Test');
      expect(octokit.issues._comments).toEqual([
        'Assigning to @getsentry/support for [routing](https://open.sentry.io/triage/#2-route), due by **<time datetime=2022-12-20T00:00:00.000Z>Tue Dec 20 2022 00:00:00 GMT+0000</time>**. ⏲️',
        'Routing to @getsentry/test for [triage](https://develop.sentry.dev/processing-tickets/#3-triage), due by **<time datetime=2022-12-21T00:00:00.000Z>Wed Dec 21 2022 00:00:00 GMT+0000</time>**. ⏲️',
      ]);
    });

    it('should not reroute if issue is closed', async function () {
      await createIssue('sentry-docs');
      await addLabel('Team: Test', 'sentry-docs');
      expectUntriaged();
      expectRouted();
      await addLabel('Team: Rerouted', 'sentry-docs', undefined, 'closed');
      expect(octokit.issues._labels).toContain('Team: Rerouted');
      expect(octokit.issues._labels).toContain('Team: Test');
      expect(octokit.issues._comments).toEqual([
        'Assigning to @getsentry/support for [routing](https://open.sentry.io/triage/#2-route), due by **<time datetime=2022-12-20T00:00:00.000Z>Tue Dec 20 2022 00:00:00 GMT+0000</time>**. ⏲️',
        'Routing to @getsentry/test for [triage](https://develop.sentry.dev/processing-tickets/#3-triage), due by **<time datetime=2022-12-21T00:00:00.000Z>Wed Dec 21 2022 00:00:00 GMT+0000</time>**. ⏲️',
      ]);
    });
  });
});

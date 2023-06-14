import { createGitHubEvent } from '@test/utils/github';

import { getLabelsTable, slackHandler } from '@/brain/issueNotifier';
import { buildServer } from '@/buildServer';
import {
  UNROUTED_LABEL,
  UNTRIAGED_LABEL,
  WAITING_FOR_COMMUNITY_LABEL,
  WAITING_FOR_PRODUCT_OWNER_LABEL,
  WAITING_FOR_SUPPORT_LABEL,
  STATUS_FIELD_ID,
  RESPONSE_DUE_DATE_FIELD_ID,
} from '@/config';
import { Fastify } from '@/types';
import { defaultErrorHandler, githubEvents } from '@api/github';
import { MockOctokitError } from '@api/github/__mocks__/mockError';
import { ClientType } from '@api/github/clientType';
import { getClient } from '@api/github/getClient';
import * as businessHourFunctions from '@utils/businessHours';
import { db } from '@utils/db';
import * as helpers from '@utils/githubEventHelpers';

import { issueLabelHandler } from '.';

describe('issueLabelHandler', function () {
  let fastify: Fastify;
  let octokit;
  const errors = jest.fn();
  let say, respond, client, ack;

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
    await getLabelsTable().insert({
      label_name: 'Product Area: Test',
      channel_id: 'CHNLIDRND1',
      offices: ['sfo'],
    });
    say = jest.fn();
    respond = jest.fn();
    client = {
      conversations: {
        info: jest
          .fn()
          .mockReturnValue({ channel: { name: 'test', is_member: true } }),
        join: jest.fn(),
      },
    };
    ack = jest.fn();
    jest.spyOn(helpers, 'getAllProjectFieldNodeIds').mockReturnValue({
      'Product Area: Test': 1,
      'Product Area: Does Not Exist': 2,
    });
  });

  afterAll(async function () {
    // @ts-expect-error
    githubEvents.removeListener('error', errors);
    githubEvents.onError(defaultErrorHandler);
    await db('label_to_channel').delete();
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
    state?: string
  ) {
    repo = repo || 'test-ttt-simple';
    state = state || 'open';

    const labels = Array.from(octokit.issues._labels, (name) => ({ name }));
    const payload: Record<string, any> = {
      sender: { login: sender || 'Skywalker' }, // default to external user
      repository: {
        name: repo,
        owner: { login: 'Enterprise' },
      },
      issue: { state, labels }, // mix in labels stored in mock
    };

    if (label) {
      payload.label = { name: label };
    }
    return payload;
  }

  async function createIssue(repo?: string, username?: string) {
    await createGitHubEvent(
      fastify,
      'issues.opened',
      makePayload(repo, undefined, username)
    );
  }

  async function addLabel(label: string, repo?: string, state?: string) {
    await createGitHubEvent(
      fastify,
      'issues.labeled',
      makePayload(repo, label, undefined, state)
    );
    octokit.issues.addLabels({ labels: [label] });
  }

  async function addComment(
    repo?: string,
    username?: string,
    membership?: string
  ) {
    await createGitHubEvent(
      fastify,
      // @ts-expect-error
      'issue_comment.created',
      {
        ...makePayload(repo, undefined, username),
        comment: { author_association: membership },
      }
    );
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
    let addIssueToGlobalIssuesProjectSpy;
    beforeAll(function () {
      addIssueToGlobalIssuesProjectSpy = jest
        .spyOn(helpers, 'addIssueToGlobalIssuesProject')
        .mockReturnValue('itemId');
    });
    afterEach(function () {
      jest.clearAllMocks();
    });

    it('adds `Status: Untriaged` to new issues', async function () {
      await createIssue();
      expectUntriaged();
      expectAdding();
      expect(octokit.issues._labels).toContain(WAITING_FOR_PRODUCT_OWNER_LABEL);
      expect(addIssueToGlobalIssuesProjectSpy).toHaveBeenCalled();
    });

    it('adds `Status: Untriaged` for GTM users', async function () {
      await createIssue(undefined, 'Troi');
      expectUntriaged();
      expectAdding();
      expect(octokit.issues._labels).toContain(WAITING_FOR_PRODUCT_OWNER_LABEL);
      expect(addIssueToGlobalIssuesProjectSpy).toHaveBeenCalled();
    });

    it('skips adding `Status: Untriaged` in untracked repos', async function () {
      await createIssue('other-repo');
      expectTriaged();
      expectNoAdding();
      expect(octokit.issues._labels).not.toContain(
        WAITING_FOR_PRODUCT_OWNER_LABEL
      );
      expect(addIssueToGlobalIssuesProjectSpy).not.toHaveBeenCalled();
    });

    it('skips adding `Status: Untriaged` when added during creation', async function () {
      untriage();
      await createIssue(undefined, 'Picard');
      expectUntriaged();
      expectNoAdding();
      expect(octokit.issues._labels).not.toContain(
        WAITING_FOR_PRODUCT_OWNER_LABEL
      );
      expect(addIssueToGlobalIssuesProjectSpy).not.toHaveBeenCalled();
    });

    it('skips adding `Status: Untriaged` for internal users', async function () {
      await createIssue(undefined, 'Picard');
      expectTriaged();
      expectNoAdding();
      expect(octokit.issues._labels).not.toContain(
        WAITING_FOR_PRODUCT_OWNER_LABEL
      );
      expect(addIssueToGlobalIssuesProjectSpy).not.toHaveBeenCalled();
    });

    // removing

    it('removes `Status: Untriaged` when adding other labels', async function () {
      untriage();
      await addLabel('Cheeseburger Pie');
      expectTriaged();
      expectRemoval();
      expect(octokit.issues._labels).not.toContain(
        WAITING_FOR_PRODUCT_OWNER_LABEL
      );
      expect(addIssueToGlobalIssuesProjectSpy).not.toHaveBeenCalled();
    });

    it('skips removing `Status: Untriaged` when its not present', async function () {
      await addLabel('Cheeseburger Pie');
      expectTriaged();
      expectNoRemoval();
      expect(octokit.issues._labels).not.toContain(
        WAITING_FOR_PRODUCT_OWNER_LABEL
      );
      expect(addIssueToGlobalIssuesProjectSpy).not.toHaveBeenCalled();
    });

    it('skips removing `Status: Untriaged` when adding `Status: Untriaged`', async function () {
      untriage();
      await addLabel(UNTRIAGED_LABEL);
      expectUntriaged();
      expectNoRemoval();
      expect(octokit.issues._labels).not.toContain(
        WAITING_FOR_PRODUCT_OWNER_LABEL
      );
      expect(addIssueToGlobalIssuesProjectSpy).not.toHaveBeenCalled();
    });

    it('skips removing `Status: Untriaged` in untracked repos', async function () {
      untriage();
      await addLabel('Cheeseburger Pie', 'other-repo');
      expectUntriaged();
      expectNoRemoval();
      expect(octokit.issues._labels).not.toContain(
        WAITING_FOR_PRODUCT_OWNER_LABEL
      );
      expect(addIssueToGlobalIssuesProjectSpy).not.toHaveBeenCalled();
    });

    it('gracefully handles race with other remover of `Status: Untriaged`', async function () {
      untriage();
      removeThrows(404);
      await addLabel('Cheeseburger Pie');
      expectNoError();
      expectTriaged();
      expectRemoval();
      expect(octokit.issues._labels).not.toContain(
        WAITING_FOR_PRODUCT_OWNER_LABEL
      );
      expect(addIssueToGlobalIssuesProjectSpy).not.toHaveBeenCalled();
    });

    it("doesn't handle non-404 errors when removing `Status: Untriaged`", async function () {
      untriage();
      removeThrows(400);
      await addLabel('Cheeseburger Pie');
      expectError(400);
      expectUntriaged();
      expectRemoval();
      expect(octokit.issues._labels).not.toContain(
        WAITING_FOR_PRODUCT_OWNER_LABEL
      );
      expect(addIssueToGlobalIssuesProjectSpy).not.toHaveBeenCalled();
    });
  });

  describe('[routing](https://open.sentry.io/triage/#2-route) test cases', function () {
    let addIssueToGlobalIssuesProjectSpy, modifyProjectIssueFieldSpy;
    beforeAll(function () {
      addIssueToGlobalIssuesProjectSpy = jest
        .spyOn(helpers, 'addIssueToGlobalIssuesProject')
        .mockReturnValue({
          addProjectV2ItemById: { item: { id: 'PROJECT_ID' } },
        });
      modifyProjectIssueFieldSpy = jest
        .spyOn(helpers, 'modifyProjectIssueField')
        .mockImplementation(jest.fn());
    });
    afterEach(function () {
      jest.clearAllMocks();
    });

    it('adds `Status: Unrouted` and `Waiting for: Support` to new issues', async function () {
      await createIssue('sentry-docs');
      expectUnrouted();
      expect(octokit.issues._labels).toContain(WAITING_FOR_SUPPORT_LABEL);
      // Simulate GitHub adding Waiting for Support Label to send webhook
      await addLabel(WAITING_FOR_SUPPORT_LABEL);
      expect(octokit.issues._comments).toEqual([
        'Assigning to @getsentry/support for [routing](https://open.sentry.io/triage/#2-route) ⏲️',
      ]);
      expect(addIssueToGlobalIssuesProjectSpy).toHaveBeenCalled();
    });

    it('adds `Status: Unrouted` and `Waiting for: Support` for GTM users', async function () {
      await createIssue('sentry-docs', 'Troi');
      expectUnrouted();
      expect(octokit.issues._labels).toContain(WAITING_FOR_SUPPORT_LABEL);
      // Simulate GitHub adding Waiting for Support Label to send webhook
      await addLabel(WAITING_FOR_SUPPORT_LABEL);
      expect(octokit.issues._comments).toEqual([
        'Assigning to @getsentry/support for [routing](https://open.sentry.io/triage/#2-route) ⏲️',
      ]);
      expect(addIssueToGlobalIssuesProjectSpy).toHaveBeenCalled();
    });

    it('skips adding `Status: Unrouted` for internal users', async function () {
      await createIssue('sentry-docs', 'Picard');
      expectRouted();
      expect(octokit.issues._labels).not.toContain(WAITING_FOR_SUPPORT_LABEL);
      expect(octokit.issues._comments).toEqual([]);
      expect(addIssueToGlobalIssuesProjectSpy).not.toHaveBeenCalled();
    });

    it('skips adding `Status: Unrouted` in untracked repos', async function () {
      await createIssue('Pizza Sandwich');
      expectRouted();
      expect(octokit.issues._labels).not.toContain(WAITING_FOR_SUPPORT_LABEL);
      expect(octokit.issues._comments).toEqual([]);
      expect(addIssueToGlobalIssuesProjectSpy).not.toHaveBeenCalled();
    });

    it('removes unrouted label when product area label is added', async function () {
      await createIssue('sentry-docs');
      await addLabel('Product Area: Test', 'sentry-docs');
      expectUntriaged();
      expectRouted();
      expect(octokit.issues._labels).not.toContain(WAITING_FOR_SUPPORT_LABEL);
      expect(octokit.issues._labels).toContain(WAITING_FOR_PRODUCT_OWNER_LABEL);
      expect(octokit.issues._comments).toEqual([
        'Assigning to @getsentry/support for [routing](https://open.sentry.io/triage/#2-route) ⏲️',
        'Routing to @getsentry/product-owners-test for [triage](https://develop.sentry.dev/processing-tickets/#3-triage) ⏲️',
      ]);
      expect(modifyProjectIssueFieldSpy).toHaveBeenCalled();
    });

    it('does not remove unrouted label when label is added that is not a product area label', async function () {
      await createIssue('sentry-docs');
      await addLabel('Status: Needs More Information', 'sentry-docs');
      expectUnrouted();
      expect(octokit.issues._labels).toContain(WAITING_FOR_SUPPORT_LABEL);
      // Simulate GitHub adding Waiting for Support Label to send webhook
      await addLabel(WAITING_FOR_SUPPORT_LABEL);
      expect(octokit.issues._comments).toEqual([
        'Assigning to @getsentry/support for [routing](https://open.sentry.io/triage/#2-route) ⏲️',
      ]);
      expect(modifyProjectIssueFieldSpy).toHaveBeenCalled();
    });

    it('should default to route to open source team if product area does not exist', async function () {
      await createIssue('sentry-docs');
      await addLabel('Product Area: Does Not Exist', 'sentry-docs');
      expectUntriaged();
      expectRouted();
      expect(octokit.issues._labels).not.toContain(WAITING_FOR_SUPPORT_LABEL);
      expect(octokit.issues._labels).toContain(WAITING_FOR_PRODUCT_OWNER_LABEL);
      expect(octokit.issues._comments).toEqual([
        'Assigning to @getsentry/support for [routing](https://open.sentry.io/triage/#2-route) ⏲️',
        'Failed to route for Product Area: Does Not Exist. Defaulting to @getsentry/open-source for [triage](https://develop.sentry.dev/processing-tickets/#3-triage) ⏲️',
      ]);
      expect(modifyProjectIssueFieldSpy).toHaveBeenCalled();
    });

    it('removes previous Product Area labels when re[routing](https://open.sentry.io/triage/#2-route)', async function () {
      await createIssue('sentry-docs');
      await addLabel('Product Area: Test', 'sentry-docs');
      expectUntriaged();
      expectRouted();
      await addLabel('Product Area: Rerouted', 'sentry-docs');
      expect(octokit.issues._labels).toContain('Product Area: Rerouted');
      expect(octokit.issues._labels).not.toContain('Product Area: Test');
      expect(octokit.issues._comments).toEqual([
        'Assigning to @getsentry/support for [routing](https://open.sentry.io/triage/#2-route) ⏲️',
        'Routing to @getsentry/product-owners-test for [triage](https://develop.sentry.dev/processing-tickets/#3-triage) ⏲️',
        'Routing to @getsentry/product-owners-rerouted for [triage](https://develop.sentry.dev/processing-tickets/#3-triage) ⏲️',
      ]);
      expect(modifyProjectIssueFieldSpy).toHaveBeenCalled();
    });

    it('should not reapply label `Waiting for: Product Owner` if issue changes product areas and is not waiting for support', async function () {
      await createIssue('sentry-docs');
      await addLabel('Product Area: Test', 'sentry-docs');
      expectUntriaged();
      expectRouted();
      await addLabel('Waiting for: Community', 'sentry-docs');
      await addLabel('Product Area: Rerouted', 'sentry-docs');
      expect(octokit.issues._labels).toContain('Product Area: Rerouted');
      expect(octokit.issues._labels).toContain('Waiting for: Community');
      expect(octokit.issues._labels).not.toContain(
        'Waiting for: Product Owner'
      );
      expect(octokit.issues._comments).toEqual([
        'Assigning to @getsentry/support for [routing](https://open.sentry.io/triage/#2-route) ⏲️',
        'Routing to @getsentry/product-owners-test for [triage](https://develop.sentry.dev/processing-tickets/#3-triage) ⏲️',
        'Routing to @getsentry/product-owners-rerouted for [triage](https://develop.sentry.dev/processing-tickets/#3-triage) ⏲️',
      ]);
      expect(modifyProjectIssueFieldSpy).toHaveBeenCalled();
    });

    it('should not reroute if Status: Backlog is exists on issue', async function () {
      await createIssue('sentry-docs');
      await addLabel('Product Area: Test', 'sentry-docs');
      expectUntriaged();
      expectRouted();
      await addLabel('Status: Backlog', 'sentry-docs');
      await addLabel('Product Area: Rerouted', 'sentry-docs');
      expect(octokit.issues._labels).toContain('Product Area: Rerouted');
      expect(octokit.issues._labels).toContain('Product Area: Test');
      expect(octokit.issues._comments).toEqual([
        'Assigning to @getsentry/support for [routing](https://open.sentry.io/triage/#2-route) ⏲️',
        'Routing to @getsentry/product-owners-test for [triage](https://develop.sentry.dev/processing-tickets/#3-triage) ⏲️',
      ]);
      expect(modifyProjectIssueFieldSpy).toHaveBeenCalled();
    });

    it('should not reroute if Status: In Progress exists on issue', async function () {
      await createIssue('sentry-docs');
      await addLabel('Product Area: Test', 'sentry-docs');
      expectUntriaged();
      expectRouted();
      await addLabel('Status: In Progress', 'sentry-docs');
      await addLabel('Product Area: Rerouted', 'sentry-docs');
      expect(octokit.issues._labels).toContain('Product Area: Rerouted');
      expect(octokit.issues._labels).toContain('Product Area: Test');
      expect(octokit.issues._comments).toEqual([
        'Assigning to @getsentry/support for [routing](https://open.sentry.io/triage/#2-route) ⏲️',
        'Routing to @getsentry/product-owners-test for [triage](https://develop.sentry.dev/processing-tickets/#3-triage) ⏲️',
      ]);
      expect(modifyProjectIssueFieldSpy).toHaveBeenCalled();
    });

    it('should not reroute if issue is closed', async function () {
      await createIssue('sentry-docs');
      await addLabel('Product Area: Test', 'sentry-docs');
      expectUntriaged();
      expectRouted();
      await addLabel('Product Area: Rerouted', 'sentry-docs', 'closed');
      expect(octokit.issues._labels).toContain('Product Area: Rerouted');
      expect(octokit.issues._labels).toContain('Product Area: Test');
      expect(octokit.issues._comments).toEqual([
        'Assigning to @getsentry/support for [routing](https://open.sentry.io/triage/#2-route) ⏲️',
        'Routing to @getsentry/product-owners-test for [triage](https://develop.sentry.dev/processing-tickets/#3-triage) ⏲️',
      ]);
      expect(modifyProjectIssueFieldSpy).toHaveBeenCalled();
    });
  });

  describe('followups test cases', function () {
    let modifyProjectIssueFieldSpy, modifyDueByDateSpy, addIssueToGlobalIssuesProjectSpy;
    beforeAll(function () {
      modifyProjectIssueFieldSpy = jest
        .spyOn(helpers, 'modifyProjectIssueField')
        .mockImplementation(jest.fn());
      modifyDueByDateSpy = jest.spyOn(helpers, 'modifyDueByDate').mockImplementation(jest.fn());
      addIssueToGlobalIssuesProjectSpy = jest
        .spyOn(helpers, 'addIssueToGlobalIssuesProject')
        .mockReturnValue('itemId');
    })
    afterEach(function () {
      jest.clearAllMocks();
    })
    const setupIssue = async () => {
      await createIssue('sentry-docs');
      await addLabel('Product Area: Test', 'sentry-docs');
    };

    it('should remove `Waiting for: Product Owner` label when another `Waiting for: *` label is added', async function () {
      await setupIssue();
      expect(octokit.issues._labels).toEqual(
        new Set([
          UNTRIAGED_LABEL,
          WAITING_FOR_PRODUCT_OWNER_LABEL,
          'Product Area: Test',
        ])
      );
      await addLabel('Waiting for: Community', 'sentry-docs');
      expect(octokit.issues._labels).toEqual(
        new Set([
          UNTRIAGED_LABEL,
          'Product Area: Test',
          WAITING_FOR_COMMUNITY_LABEL,
        ])
      );
      await addLabel('Waiting for: Support', 'sentry-docs');
      expect(octokit.issues._labels).toEqual(
        new Set([
          UNTRIAGED_LABEL,
          'Product Area: Test',
          WAITING_FOR_SUPPORT_LABEL,
        ])
      );
      expect(modifyProjectIssueFieldSpy).toHaveBeenLastCalledWith('itemId', WAITING_FOR_SUPPORT_LABEL, STATUS_FIELD_ID, octokit);
      expect(modifyDueByDateSpy).toHaveBeenLastCalledWith('itemId', '2022-12-20T00:00:00.000Z', RESPONSE_DUE_DATE_FIELD_ID, octokit);
    });

    it('should not add `Waiting for: Product Owner` label when product owner/GTM member comments and issue is waiting for community', async function () {
      await setupIssue();
      await addLabel(WAITING_FOR_COMMUNITY_LABEL, 'sentry-docs');
      jest.spyOn(helpers, 'isNotFromAnExternalOrGTMUser').mockReturnValue(true);
      await addComment('sentry-docs', 'Picard');
      expect(octokit.issues._labels).toEqual(
        new Set([
          UNTRIAGED_LABEL,
          'Product Area: Test',
          WAITING_FOR_COMMUNITY_LABEL,
        ])
      );
      expect(modifyProjectIssueFieldSpy).toHaveBeenLastCalledWith('itemId', WAITING_FOR_COMMUNITY_LABEL, STATUS_FIELD_ID, octokit);
      expect(modifyDueByDateSpy).toHaveBeenLastCalledWith('itemId', '', RESPONSE_DUE_DATE_FIELD_ID, octokit);
    });

    it('should not add `Waiting for: Product Owner` label when contractor comments and issue is waiting for community', async function () {
      await setupIssue();
      await addLabel(WAITING_FOR_COMMUNITY_LABEL, 'sentry-docs');
      jest.spyOn(helpers, 'isNotFromAnExternalOrGTMUser').mockReturnValue(true);
      await addComment('sentry-docs', 'Picard', 'COLLABORATOR');
      expect(octokit.issues._labels).toEqual(
        new Set([
          UNTRIAGED_LABEL,
          'Product Area: Test',
          WAITING_FOR_COMMUNITY_LABEL,
        ])
      );
      expect(modifyProjectIssueFieldSpy).toHaveBeenLastCalledWith('itemId', WAITING_FOR_COMMUNITY_LABEL, STATUS_FIELD_ID, octokit);
      expect(modifyDueByDateSpy).toHaveBeenLastCalledWith('itemId', '', RESPONSE_DUE_DATE_FIELD_ID, octokit);
    });

    it('should not add `Waiting for: Product Owner` label when community member comments and issue is not waiting for community', async function () {
      await setupIssue();
      jest
        .spyOn(helpers, 'isNotFromAnExternalOrGTMUser')
        .mockReturnValue(false);
      await addLabel(WAITING_FOR_SUPPORT_LABEL, 'sentry-docs');
      await addComment('sentry-docs', 'Picard');
      expect(octokit.issues._labels).toEqual(
        new Set([
          UNTRIAGED_LABEL,
          'Product Area: Test',
          WAITING_FOR_SUPPORT_LABEL,
        ])
      );
      expect(modifyProjectIssueFieldSpy).toHaveBeenLastCalledWith('itemId', WAITING_FOR_SUPPORT_LABEL, STATUS_FIELD_ID, octokit);
      expect(modifyDueByDateSpy).toHaveBeenLastCalledWith('itemId', '2022-12-20T00:00:00.000Z', RESPONSE_DUE_DATE_FIELD_ID, octokit);
    });

    it('should add `Waiting for: Product Owner` label when community member comments and issue is waiting for community', async function () {
      await setupIssue();
      await addLabel(WAITING_FOR_COMMUNITY_LABEL, 'sentry-docs');
      jest
        .spyOn(helpers, 'isNotFromAnExternalOrGTMUser')
        .mockReturnValue(false);
      await addComment('sentry-docs', 'Picard');
      expect(octokit.issues._labels).toEqual(
        new Set([
          UNTRIAGED_LABEL,
          'Product Area: Test',
          WAITING_FOR_PRODUCT_OWNER_LABEL,
        ])
      );
      // Simulate GH webhook being thrown when Waiting for: Product Owner label is added
      await addLabel(WAITING_FOR_PRODUCT_OWNER_LABEL);
      expect(modifyProjectIssueFieldSpy).toHaveBeenLastCalledWith('itemId', WAITING_FOR_PRODUCT_OWNER_LABEL, STATUS_FIELD_ID, octokit);
      expect(modifyDueByDateSpy).toHaveBeenLastCalledWith('itemId', '2022-12-21T00:00:00.000Z', RESPONSE_DUE_DATE_FIELD_ID, octokit);
    });

    it('should not modify labels when community member comments and issue is waiting for product owner', async function () {
      await setupIssue();
      await addLabel(WAITING_FOR_PRODUCT_OWNER_LABEL, 'sentry-docs');
      jest
        .spyOn(helpers, 'isNotFromAnExternalOrGTMUser')
        .mockReturnValue(false);
      await addComment('sentry-docs', 'Picard');
      expect(octokit.issues._labels).toEqual(
        new Set([
          UNTRIAGED_LABEL,
          'Product Area: Test',
          WAITING_FOR_PRODUCT_OWNER_LABEL,
        ])
      );
      expect(modifyProjectIssueFieldSpy).toHaveBeenLastCalledWith('itemId', WAITING_FOR_PRODUCT_OWNER_LABEL, STATUS_FIELD_ID, octokit);
      expect(modifyDueByDateSpy).toHaveBeenLastCalledWith('itemId', '2022-12-21T00:00:00.000Z', RESPONSE_DUE_DATE_FIELD_ID, octokit);
    });
  });
});

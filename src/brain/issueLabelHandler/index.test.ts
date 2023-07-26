import moment from 'moment-timezone';

import { createGitHubEvent } from '@test/utils/github';

import { getLabelsTable, slackHandler } from '@/brain/issueNotifier';
import { buildServer } from '@/buildServer';
import {
  GETSENTRY_ORG,
  WAITING_FOR_COMMUNITY_LABEL,
  WAITING_FOR_PRODUCT_OWNER_LABEL,
  WAITING_FOR_SUPPORT_LABEL,
} from '@/config';
import { Fastify } from '@/types';
import { defaultErrorHandler, githubEvents } from '@api/github';
import { MockOctokitError } from '@api/github/__mocks__/mockError';
import * as businessHourFunctions from '@utils/businessHours';
import { db } from '@utils/db';

import { issueLabelHandler } from '.';

describe('issueLabelHandler', function () {
  let fastify: Fastify;
  const org = GETSENTRY_ORG;
  const errors = jest.fn();
  let say, respond, client, ack;
  let calculateSLOViolationRouteSpy, calculateSLOViolationTriageSpy;

  beforeAll(async function () {
    await db.migrate.latest();
    githubEvents.removeListener('error', defaultErrorHandler);
    githubEvents.onError(errors);
    calculateSLOViolationRouteSpy = jest
      .spyOn(businessHourFunctions, 'calculateSLOViolationRoute')
      .mockReturnValue('2022-12-20T00:00:00.000Z');
    calculateSLOViolationTriageSpy = jest
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
    jest.spyOn(org, 'getAllProjectFieldNodeIds').mockReturnValue({
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
  });

  afterEach(async function () {
    fastify.close();
    org.api.issues._labels = new Set([]);
    org.api.issues.addLabels.mockClear();
    org.api.issues.removeLabel.mockClear();
    org.api.issues._comments = [];
    org.api.issues.createComment.mockClear();
    org.api.teams.getByName.mockClear();
    errors.mockClear();
  });

  // Helpers

  function removeWaitingForProductOwnerLabel() {
    org.api.issues._labels.delete(WAITING_FOR_PRODUCT_OWNER_LABEL);
  }

  function addWaitingForProductOwnerLabel() {
    org.api.issues._labels.add(WAITING_FOR_PRODUCT_OWNER_LABEL);
  }

  function removeThrows(status) {
    org.api.issues.removeLabel.mockImplementationOnce(async () => {
      if (status === 404) {
        removeWaitingForProductOwnerLabel(); // pretend a previous attempt succeeded
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

    const labels = Array.from(org.api.issues._labels, (name) => ({ name }));
    const payload: Record<string, any> = {
      sender: { login: sender || 'Skywalker' }, // default to external user
      repository: {
        name: repo,
        owner: { login: GETSENTRY_ORG.slug },
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

  async function createPR(repo?: string, username?: string) {
    await createGitHubEvent(
      fastify,
      'pull_request.opened',
      makePayload(repo, undefined, username)
    );
  }

  async function addLabel(label: string, repo?: string, state?: string) {
    await createGitHubEvent(
      fastify,
      'issues.labeled',
      makePayload(repo, label, undefined, state)
    );
    org.api.issues.addLabels({ labels: [label] });
  }

  async function addComment(repo: string, username: string, isPR?: boolean) {
    let membership;
    if (username === 'Picard') {
      membership = 'OWNER';
    } else if (username === 'Troi') {
      membership = 'COLLABORATOR';
    } else if (username === 'Skywalker') {
      membership = 'NONE';
    } else {
      throw `Unknown user: '${username}'`;
    }
    const payload = {
      ...makePayload(repo, undefined, username),
      comment: { author_association: membership },
    };
    if (isPR) {
      payload['issue'].pull_request = {};
    }
    await createGitHubEvent(
      fastify,
      // @ts-expect-error
      'issue_comment.created',
      payload
    );
  }

  // Expectations

  function expectWaitingForSupport() {
    expect(org.api.issues._labels).toContain(WAITING_FOR_SUPPORT_LABEL);
  }

  function expectNotWaitingForSupport() {
    expect(org.api.issues._labels).not.toContain(WAITING_FOR_SUPPORT_LABEL);
  }

  function expectWaitingforProductOwner() {
    expect(org.api.issues._labels).toContain(WAITING_FOR_PRODUCT_OWNER_LABEL);
  }

  function expectNotWaitingforProductOwner() {
    expect(org.api.issues._labels).not.toContain(
      WAITING_FOR_PRODUCT_OWNER_LABEL
    );
  }

  function expectRemoval() {
    expect(org.api.issues.removeLabel).toBeCalled();
  }

  function expectNoRemoval() {
    expect(org.api.issues.removeLabel).not.toBeCalled();
  }

  function expectAdding() {
    expect(org.api.issues.addLabels).toBeCalled();
  }

  function expectNoAdding() {
    expect(org.api.issues.addLabels).not.toBeCalled();
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
        .spyOn(org, 'addIssueToGlobalIssuesProject')
        .mockReturnValue('itemId');
    });
    afterEach(function () {
      jest.clearAllMocks();
    });

    it('adds `Waiting for: Product Owner` to new issues', async function () {
      await createIssue();
      expectWaitingforProductOwner();
      expectAdding();
      expect(org.api.issues._labels).toContain(WAITING_FOR_PRODUCT_OWNER_LABEL);
      expect(addIssueToGlobalIssuesProjectSpy).toHaveBeenCalled();
    });

    it('adds `Waiting for: Product Owner` for GTM users', async function () {
      await createIssue(undefined, 'Troi');
      expectWaitingforProductOwner();
      expectAdding();
      expect(org.api.issues._labels).toContain(WAITING_FOR_PRODUCT_OWNER_LABEL);
      expect(addIssueToGlobalIssuesProjectSpy).toHaveBeenCalled();
    });

    it('skips adding `Waiting for: Product Owner` in untracked repos', async function () {
      await createIssue('other-repo');
      expectNotWaitingforProductOwner();
      expectNoAdding();
      expect(addIssueToGlobalIssuesProjectSpy).not.toHaveBeenCalled();
    });

    it('skips adding `Waiting for: Product Owner` when added during creation', async function () {
      addWaitingForProductOwnerLabel();
      await createIssue(undefined, 'Picard');
      expectWaitingforProductOwner();
      expectNoAdding();
      expect(addIssueToGlobalIssuesProjectSpy).not.toHaveBeenCalled();
    });

    it('skips adding `Waiting for: Product Owner` for internal users', async function () {
      await createIssue(undefined, 'Picard');
      expectNotWaitingforProductOwner();
      expectNoAdding();
      expect(addIssueToGlobalIssuesProjectSpy).not.toHaveBeenCalled();
    });

    // removing

    it('removes `Waiting for: Product Owner` when adding other labels', async function () {
      addWaitingForProductOwnerLabel();
      await addLabel('Cheeseburger Pie');
      expectNotWaitingforProductOwner();
      expectRemoval();
      expect(addIssueToGlobalIssuesProjectSpy).not.toHaveBeenCalled();
    });

    it('skips removing `Waiting for: Product Owner` when its not present', async function () {
      await addLabel('Cheeseburger Pie');
      expectNotWaitingforProductOwner();
      expectNoRemoval();
      expect(addIssueToGlobalIssuesProjectSpy).not.toHaveBeenCalled();
    });

    it('skips removing `Waiting for: Product Owner` when adding `Waiting for: Product Owner`', async function () {
      addWaitingForProductOwnerLabel();
      expectWaitingforProductOwner();
      expectNoRemoval();
      expect(addIssueToGlobalIssuesProjectSpy).not.toHaveBeenCalled();
    });

    it('skips removing `Waiting for: Product Owner` in untracked repos', async function () {
      addWaitingForProductOwnerLabel();
      await addLabel('Cheeseburger Pie', 'other-repo');
      expectWaitingforProductOwner();
      expectNoRemoval();
      expect(addIssueToGlobalIssuesProjectSpy).not.toHaveBeenCalled();
    });

    it('gracefully handles race with other remover of `Waiting for: Product Owner`', async function () {
      addWaitingForProductOwnerLabel();
      removeThrows(404);
      await addLabel('Cheeseburger Pie');
      expectNoError();
      expectNotWaitingforProductOwner();
      expectRemoval();
      expect(addIssueToGlobalIssuesProjectSpy).not.toHaveBeenCalled();
    });

    it("doesn't handle non-404 errors when removing `Waiting for: Product Owner`", async function () {
      addWaitingForProductOwnerLabel();
      removeThrows(400);
      await addLabel('Cheeseburger Pie');
      expectError(400);
      expectWaitingforProductOwner();
      expectRemoval();
      expect(addIssueToGlobalIssuesProjectSpy).not.toHaveBeenCalled();
    });
  });

  describe('[routing](https://open.sentry.io/triage/#2-route) test cases', function () {
    let addIssueToGlobalIssuesProjectSpy, modifyProjectIssueFieldSpy;
    beforeAll(function () {
      addIssueToGlobalIssuesProjectSpy = jest
        .spyOn(org, 'addIssueToGlobalIssuesProject')
        .mockReturnValue({
          addProjectV2ItemById: { item: { id: 'PROJECT_ID' } },
        });
      modifyProjectIssueFieldSpy = jest
        .spyOn(org, 'modifyProjectIssueField')
        .mockImplementation(jest.fn());
    });
    afterEach(function () {
      jest.clearAllMocks();
    });

    it('adds `Status: Unrouted` and `Waiting for: Support` to new issues', async function () {
      await createIssue('routing-repo');
      expectWaitingForSupport();
      expect(org.api.issues._labels).toContain(WAITING_FOR_SUPPORT_LABEL);
      // Simulate GitHub adding Waiting for Support Label to send webhook
      await addLabel(WAITING_FOR_SUPPORT_LABEL);
      expect(org.api.issues._comments).toEqual([
        'Assigning to @getsentry/support for [routing](https://open.sentry.io/triage/#2-route) ⏲️',
      ]);
      expect(addIssueToGlobalIssuesProjectSpy).toHaveBeenCalled();
    });

    it('adds `Status: Unrouted` and `Waiting for: Support` for GTM users', async function () {
      await createIssue('routing-repo', 'Troi');
      expectWaitingForSupport();
      expect(org.api.issues._labels).toContain(WAITING_FOR_SUPPORT_LABEL);
      // Simulate GitHub adding Waiting for Support Label to send webhook
      await addLabel(WAITING_FOR_SUPPORT_LABEL);
      expect(org.api.issues._comments).toEqual([
        'Assigning to @getsentry/support for [routing](https://open.sentry.io/triage/#2-route) ⏲️',
      ]);
      expect(addIssueToGlobalIssuesProjectSpy).toHaveBeenCalled();
    });

    it('skips adding `Waiting for: Support` for internal users', async function () {
      await createIssue('routing-repo', 'Picard');
      expectNotWaitingForSupport();
      expect(org.api.issues._labels).not.toContain(WAITING_FOR_SUPPORT_LABEL);
      expect(org.api.issues._comments).toEqual([]);
      expect(addIssueToGlobalIssuesProjectSpy).not.toHaveBeenCalled();
    });

    it('skips adding `Waiting for: Support` in untracked repos', async function () {
      await createIssue('Pizza Sandwich');
      expectNotWaitingForSupport();
      expect(org.api.issues._labels).not.toContain(WAITING_FOR_SUPPORT_LABEL);
      expect(org.api.issues._comments).toEqual([]);
      expect(addIssueToGlobalIssuesProjectSpy).not.toHaveBeenCalled();
    });

    it('removes waiting for support label when product area label is added', async function () {
      await createIssue('routing-repo');
      await addLabel('Product Area: Test', 'routing-repo');
      expectWaitingforProductOwner();
      expectNotWaitingForSupport();
      expect(org.api.issues._labels).not.toContain(WAITING_FOR_SUPPORT_LABEL);
      expect(org.api.issues._labels).toContain(WAITING_FOR_PRODUCT_OWNER_LABEL);
      expect(org.api.issues._comments).toEqual([
        'Assigning to @getsentry/support for [routing](https://open.sentry.io/triage/#2-route) ⏲️',
        'Routing to @getsentry/product-owners-test for [triage](https://develop.sentry.dev/processing-tickets/#3-triage) ⏲️',
      ]);
      expect(modifyProjectIssueFieldSpy).toHaveBeenCalled();
    });

    it('does not remove waiting for support label when label is added that is not a product area label', async function () {
      await createIssue('routing-repo');
      await addLabel('Status: Needs More Information', 'routing-repo');
      expectWaitingForSupport();
      expect(org.api.issues._labels).toContain(WAITING_FOR_SUPPORT_LABEL);
      // Simulate GitHub adding Waiting for Support Label to send webhook
      await addLabel(WAITING_FOR_SUPPORT_LABEL);
      expect(org.api.issues._comments).toEqual([
        'Assigning to @getsentry/support for [routing](https://open.sentry.io/triage/#2-route) ⏲️',
      ]);
      expect(modifyProjectIssueFieldSpy).toHaveBeenCalled();
    });

    it('should default to route to open source team if product area does not exist', async function () {
      await createIssue('routing-repo');
      await addLabel('Product Area: Does Not Exist', 'routing-repo');
      expectWaitingforProductOwner();
      expectNotWaitingForSupport();
      expect(org.api.issues._labels).not.toContain(WAITING_FOR_SUPPORT_LABEL);
      expect(org.api.issues._labels).toContain(WAITING_FOR_PRODUCT_OWNER_LABEL);
      expect(org.api.issues._comments).toEqual([
        'Assigning to @getsentry/support for [routing](https://open.sentry.io/triage/#2-route) ⏲️',
        'Failed to route for Product Area: Does Not Exist. Defaulting to @getsentry/open-source for [triage](https://develop.sentry.dev/processing-tickets/#3-triage) ⏲️',
      ]);
      expect(modifyProjectIssueFieldSpy).toHaveBeenCalled();
    });

    it('removes previous Product Area labels when re[routing](https://open.sentry.io/triage/#2-route)', async function () {
      await createIssue('routing-repo');
      await addLabel('Product Area: Test', 'routing-repo');
      expectWaitingforProductOwner();
      expectNotWaitingForSupport();
      await addLabel('Product Area: Rerouted', 'routing-repo');
      expect(org.api.issues._labels).toContain('Product Area: Rerouted');
      expect(org.api.issues._labels).not.toContain('Product Area: Test');
      expect(org.api.issues._comments).toEqual([
        'Assigning to @getsentry/support for [routing](https://open.sentry.io/triage/#2-route) ⏲️',
        'Routing to @getsentry/product-owners-test for [triage](https://develop.sentry.dev/processing-tickets/#3-triage) ⏲️',
        'Routing to @getsentry/product-owners-rerouted for [triage](https://develop.sentry.dev/processing-tickets/#3-triage) ⏲️',
      ]);
      expect(modifyProjectIssueFieldSpy).toHaveBeenCalled();
    });

    it('should not reapply label `Waiting for: Product Owner` if issue changes product areas and is not waiting for support', async function () {
      await createIssue('routing-repo');
      await addLabel('Product Area: Test', 'routing-repo');
      expectWaitingforProductOwner();
      expectNotWaitingForSupport();
      await addLabel('Waiting for: Community', 'routing-repo');
      await addLabel('Product Area: Rerouted', 'routing-repo');
      expect(org.api.issues._labels).toContain('Product Area: Rerouted');
      expect(org.api.issues._labels).toContain('Waiting for: Community');
      expect(org.api.issues._labels).not.toContain(
        'Waiting for: Product Owner'
      );
      expect(org.api.issues._comments).toEqual([
        'Assigning to @getsentry/support for [routing](https://open.sentry.io/triage/#2-route) ⏲️',
        'Routing to @getsentry/product-owners-test for [triage](https://develop.sentry.dev/processing-tickets/#3-triage) ⏲️',
        'Routing to @getsentry/product-owners-rerouted for [triage](https://develop.sentry.dev/processing-tickets/#3-triage) ⏲️',
      ]);
      expect(modifyProjectIssueFieldSpy).toHaveBeenCalled();
    });

    it('should not reroute if Status: Backlog is exists on issue', async function () {
      await createIssue('routing-repo');
      await addLabel('Product Area: Test', 'routing-repo');
      expectWaitingforProductOwner();
      expectNotWaitingForSupport();
      await addLabel('Status: Backlog', 'routing-repo');
      await addLabel('Product Area: Rerouted', 'routing-repo');
      expect(org.api.issues._labels).toContain('Product Area: Rerouted');
      expect(org.api.issues._labels).toContain('Product Area: Test');
      expect(org.api.issues._comments).toEqual([
        'Assigning to @getsentry/support for [routing](https://open.sentry.io/triage/#2-route) ⏲️',
        'Routing to @getsentry/product-owners-test for [triage](https://develop.sentry.dev/processing-tickets/#3-triage) ⏲️',
      ]);
      expect(modifyProjectIssueFieldSpy).toHaveBeenCalled();
    });

    it('should not reroute if Status: In Progress exists on issue', async function () {
      await createIssue('routing-repo');
      await addLabel('Product Area: Test', 'routing-repo');
      expectWaitingforProductOwner();
      expectNotWaitingForSupport();
      await addLabel('Status: In Progress', 'routing-repo');
      await addLabel('Product Area: Rerouted', 'routing-repo');
      expect(org.api.issues._labels).toContain('Product Area: Rerouted');
      expect(org.api.issues._labels).toContain('Product Area: Test');
      expect(org.api.issues._comments).toEqual([
        'Assigning to @getsentry/support for [routing](https://open.sentry.io/triage/#2-route) ⏲️',
        'Routing to @getsentry/product-owners-test for [triage](https://develop.sentry.dev/processing-tickets/#3-triage) ⏲️',
      ]);
      expect(modifyProjectIssueFieldSpy).toHaveBeenCalled();
    });

    it('should not reroute if issue is closed', async function () {
      await createIssue('routing-repo');
      await addLabel('Product Area: Test', 'routing-repo');
      expectWaitingforProductOwner();
      expectNotWaitingForSupport();
      await addLabel('Product Area: Rerouted', 'routing-repo', 'closed');
      expect(org.api.issues._labels).toContain('Product Area: Rerouted');
      expect(org.api.issues._labels).toContain('Product Area: Test');
      expect(org.api.issues._comments).toEqual([
        'Assigning to @getsentry/support for [routing](https://open.sentry.io/triage/#2-route) ⏲️',
        'Routing to @getsentry/product-owners-test for [triage](https://develop.sentry.dev/processing-tickets/#3-triage) ⏲️',
      ]);
      expect(modifyProjectIssueFieldSpy).toHaveBeenCalled();
    });
  });

  describe('followups test cases', function () {
    let modifyProjectIssueFieldSpy,
      modifyDueByDateSpy,
      addIssueToGlobalIssuesProjectSpy;
    beforeAll(function () {
      modifyProjectIssueFieldSpy = jest
        .spyOn(org, 'modifyProjectIssueField')
        .mockImplementation(jest.fn());
      modifyDueByDateSpy = jest
        .spyOn(org, 'modifyDueByDate')
        .mockImplementation(jest.fn());
      addIssueToGlobalIssuesProjectSpy = jest
        .spyOn(org, 'addIssueToGlobalIssuesProject')
        .mockReturnValue('itemId');
    });
    afterEach(function () {
      jest.clearAllMocks();
    });
    const setupIssue = async () => {
      await createIssue('routing-repo');
      await addLabel('Product Area: Test', 'routing-repo');
    };

    it('should remove `Waiting for: Product Owner` label when another `Waiting for: *` label is added', async function () {
      await setupIssue();

      expect(org.api.issues._labels).toEqual(
        new Set([WAITING_FOR_PRODUCT_OWNER_LABEL, 'Product Area: Test'])
      );
      await addLabel('Waiting for: Community', 'routing-repo');
      expect(org.api.issues._labels).toEqual(
        new Set(['Product Area: Test', WAITING_FOR_COMMUNITY_LABEL])
      );
      await addLabel('Waiting for: Support', 'routing-repo');
      expect(org.api.issues._labels).toEqual(
        new Set(['Product Area: Test', WAITING_FOR_SUPPORT_LABEL])
      );
      expect(modifyProjectIssueFieldSpy).toHaveBeenLastCalledWith(
        'itemId',
        WAITING_FOR_SUPPORT_LABEL,
        org.project.fieldIds.status
      );
      expect(modifyDueByDateSpy).toHaveBeenLastCalledWith(
        'itemId',
        '2022-12-20T00:00:00.000Z',
        org.project.fieldIds.responseDue
      );
    });

    it('should not add `Waiting for: Product Owner` label when product owner/GTM member comments and issue is waiting for community', async function () {
      await setupIssue();
      await addLabel(WAITING_FOR_COMMUNITY_LABEL, 'routing-repo');
      await addComment('routing-repo', 'Picard');
      expect(org.api.issues._labels).toEqual(
        new Set(['Product Area: Test', WAITING_FOR_COMMUNITY_LABEL])
      );
      expect(modifyProjectIssueFieldSpy).toHaveBeenLastCalledWith(
        'itemId',
        WAITING_FOR_COMMUNITY_LABEL,
        org.project.fieldIds.status
      );
      expect(modifyDueByDateSpy).toHaveBeenLastCalledWith(
        'itemId',
        '',
        org.project.fieldIds.responseDue
      );
    });

    it('should not add `Waiting for: Product Owner` label when contractor comments and issue is waiting for community', async function () {
      await setupIssue();
      await addLabel(WAITING_FOR_COMMUNITY_LABEL, 'routing-repo');
      await addComment('routing-repo', 'Troi');
      expect(org.api.issues._labels).toEqual(
        new Set(['Product Area: Test', WAITING_FOR_COMMUNITY_LABEL])
      );
      expect(modifyProjectIssueFieldSpy).toHaveBeenLastCalledWith(
        'itemId',
        WAITING_FOR_COMMUNITY_LABEL,
        org.project.fieldIds.status
      );
      expect(modifyDueByDateSpy).toHaveBeenLastCalledWith(
        'itemId',
        '',
        org.project.fieldIds.responseDue
      );
    });

    it('should not add `Waiting for: Product Owner` label when community member comments and issue is a PR', async function () {
      await createPR('routing-repo');
      await addComment('routing-repo', 'Skywalker', true);
      expect(org.api.issues._labels).toEqual(new Set([]));
    });

    it('should add `Waiting for: Product Owner` label when community member comments and issue is not waiting for community', async function () {
      await setupIssue();
      await addComment('routing-repo', 'Skywalker');
      expect(org.api.issues._labels).toEqual(
        new Set(['Product Area: Test', WAITING_FOR_PRODUCT_OWNER_LABEL])
      );
      // Simulate GH webhook being thrown when Waiting for: Product Owner label is added
      await addLabel(WAITING_FOR_PRODUCT_OWNER_LABEL);
      expect(modifyProjectIssueFieldSpy).toHaveBeenLastCalledWith(
        'itemId',
        WAITING_FOR_PRODUCT_OWNER_LABEL,
        org.project.fieldIds.status
      );
      expect(modifyDueByDateSpy).toHaveBeenLastCalledWith(
        'itemId',
        '2022-12-21T00:00:00.000Z',
        org.project.fieldIds.responseDue
      );
    });

    it('should add `Waiting for: Product Owner` label when community member comments and issue is waiting for community', async function () {
      await setupIssue();
      await addLabel(WAITING_FOR_COMMUNITY_LABEL, 'routing-repo');
      await addComment('routing-repo', 'Skywalker');
      expect(org.api.issues._labels).toEqual(
        new Set(['Product Area: Test', WAITING_FOR_PRODUCT_OWNER_LABEL])
      );
      // Simulate GH webhook being thrown when Waiting for: Product Owner label is added
      await addLabel(WAITING_FOR_PRODUCT_OWNER_LABEL);
      expect(modifyProjectIssueFieldSpy).toHaveBeenLastCalledWith(
        'itemId',
        WAITING_FOR_PRODUCT_OWNER_LABEL,
        org.project.fieldIds.status
      );
      expect(modifyDueByDateSpy).toHaveBeenLastCalledWith(
        'itemId',
        '2022-12-21T00:00:00.000Z',
        org.project.fieldIds.responseDue
      );
    });

    it('should modify time to respond by when adding `Waiting for: Product Owner` label when calculateSLOViolationTriage returns null', async function () {
      await setupIssue();
      calculateSLOViolationTriageSpy.mockReturnValue(null);
      jest.spyOn(Date, 'now').mockReturnValue('2023-06-20T00:00:00.000Z');
      // Simulate GH webhook being thrown when Waiting for: Product Owner label is added
      await addLabel(WAITING_FOR_PRODUCT_OWNER_LABEL);
      expect(modifyProjectIssueFieldSpy).toHaveBeenLastCalledWith(
        'itemId',
        WAITING_FOR_PRODUCT_OWNER_LABEL,
        org.project.fieldIds.status
      );
      expect(modifyDueByDateSpy).toHaveBeenLastCalledWith(
        'itemId',
        '2023-06-20T00:00:00.000Z',
        org.project.fieldIds.responseDue
      );
      // Restore old mock return value used throughout the file
      calculateSLOViolationTriageSpy.mockReturnValue(
        '2022-12-21T00:00:00.000Z'
      );
    });

    it('should modify time to respond by when adding `Waiting for: Support` label when calculateSLOViolationTriage returns null', async function () {
      await createIssue('routing-repo');
      calculateSLOViolationRouteSpy.mockReturnValue(null);
      jest.spyOn(Date, 'now').mockReturnValue('2023-06-20T00:00:00.000Z');
      // Simulate GH webhook being thrown when Waiting for: Product Owner label is added
      await addLabel(WAITING_FOR_SUPPORT_LABEL);
      expect(modifyProjectIssueFieldSpy).toHaveBeenLastCalledWith(
        'itemId',
        WAITING_FOR_SUPPORT_LABEL,
        org.project.fieldIds.status
      );
      expect(modifyDueByDateSpy).toHaveBeenLastCalledWith(
        'itemId',
        '2023-06-20T00:00:00.000Z',
        org.project.fieldIds.responseDue
      );
      // Restore old mock return value used throughout the file
      calculateSLOViolationTriageSpy.mockReturnValue(
        '2022-12-21T00:00:00.000Z'
      );
    });

    it('should not modify labels when community member comments and issue is waiting for product owner', async function () {
      await setupIssue();
      await addLabel(WAITING_FOR_PRODUCT_OWNER_LABEL, 'routing-repo');
      await addComment('routing-repo', 'Picard');
      expect(org.api.issues._labels).toEqual(
        new Set(['Product Area: Test', WAITING_FOR_PRODUCT_OWNER_LABEL])
      );
      expect(modifyProjectIssueFieldSpy).toHaveBeenLastCalledWith(
        'itemId',
        WAITING_FOR_PRODUCT_OWNER_LABEL,
        org.project.fieldIds.status
      );
      expect(modifyDueByDateSpy).toHaveBeenLastCalledWith(
        'itemId',
        '2022-12-21T00:00:00.000Z',
        org.project.fieldIds.responseDue
      );
    });
  });
});

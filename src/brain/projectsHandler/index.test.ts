import { createGitHubEvent } from '@test/utils/github';

import { buildServer } from '@/buildServer';
import { ISSUES_PROJECT_NODE_ID, PRODUCT_AREA_FIELD_ID } from '@/config';
import { Fastify } from '@/types';
import { defaultErrorHandler, githubEvents } from '@api/github';
import { ClientType } from '@api/github/clientType';
import { getClient } from '@api/github/getClient';
import { db } from '@utils/db';
import * as helpers from '@utils/githubEventHelpers';

import { projectsHandler } from '.';

describe('projectsHandler', function () {
  let fastify: Fastify;
  let octokit;
  const errors = jest.fn();

  beforeAll(async function () {
    await db.migrate.latest();
    githubEvents.removeListener('error', defaultErrorHandler);
    githubEvents.onError(errors);
    jest.spyOn(helpers, 'getAllProductAreaNodeIds').mockReturnValue({
      'Product Area: Test': 1,
      'Product Area: Does Not Exist': 2,
    });
  });

  afterAll(async function () {
    githubEvents.removeListener('error', errors);
    githubEvents.onError(defaultErrorHandler);
    await db('label_to_channel').delete();
    await db.destroy();
  });

  beforeEach(async function () {
    fastify = await buildServer(false);
    await projectsHandler();
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

  async function editProjectField(
    projectNodeId?: string,
    fieldNodeId?: string
  ) {
    const projectPayload = {
      organization: { login: 'test-org' },
      projects_v2_item: {
        project_node_id: projectNodeId || 'test-project-node-id',
        node_id: 'test-node-id',
        content_node_id: 'test-content-node-id',
      },
      changes: {
        field_value: {
          field_node_id: fieldNodeId,
        },
      },
    };
    await createGitHubEvent(
      fastify,
      // @ts-expect-error
      'projects_v2_item.edited',
      projectPayload
    );
  }

  describe('projects test cases', function () {
    let getProductAreaFromProjectFieldSpy,
      getIssueDetailsFromNodeIdSpy,
      octokitIssuesSpy;
    beforeAll(function () {
      getProductAreaFromProjectFieldSpy = jest.spyOn(
        helpers,
        'getProductAreaFromProjectField'
      );
      getIssueDetailsFromNodeIdSpy = jest.spyOn(
        helpers,
        'getIssueDetailsFromNodeId'
      );
    });
    afterEach(function () {
      jest.clearAllMocks();
    });
    it('should ignore project event if it is not issues project', async function () {
      octokitIssuesSpy = jest.spyOn(octokit.issues, 'addLabels');
      await editProjectField();
      expect(getProductAreaFromProjectFieldSpy).not.toHaveBeenCalled();
      expect(getIssueDetailsFromNodeIdSpy).not.toHaveBeenCalled();
      expect(octokitIssuesSpy).not.toHaveBeenCalled();
    });

    it('should ignore project event if it is issues project but not product area field id', async function () {
      octokitIssuesSpy = jest.spyOn(octokit.issues, 'addLabels');
      await editProjectField(ISSUES_PROJECT_NODE_ID);
      expect(getProductAreaFromProjectFieldSpy).not.toHaveBeenCalled();
      expect(getIssueDetailsFromNodeIdSpy).not.toHaveBeenCalled();
      expect(octokitIssuesSpy).not.toHaveBeenCalled();
    });

    it('should not ignore project event if it is issues project and product field id', async function () {
      octokitIssuesSpy = jest.spyOn(octokit.issues, 'addLabels');
      getProductAreaFromProjectFieldSpy.mockReturnValue('Test');
      await editProjectField(ISSUES_PROJECT_NODE_ID, PRODUCT_AREA_FIELD_ID);
      expect(getProductAreaFromProjectFieldSpy).toHaveBeenCalled();
      expect(getIssueDetailsFromNodeIdSpy).toHaveBeenCalled();
      expect(octokitIssuesSpy).toHaveBeenCalled();
      expect(octokit.issues._labels).toContain('Product Area: Test');
    });
  });
});
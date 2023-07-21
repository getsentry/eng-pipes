import { createGitHubEvent } from '@test/utils/github';

import { buildServer } from '@/buildServer';
import { GH_ORGS } from '@/config';
import { Fastify } from '@/types';
import { defaultErrorHandler, githubEvents } from '@api/github';
import { ClientType } from '@api/github/clientType';
import { getClient } from '@api/github/getClient';
import * as helpers from '@api/github/helpers';
import { db } from '@utils/db';

import { projectsHandler } from '.';

describe('projectsHandler', function () {
  let fastify: Fastify;
  let octokit;
  const org = GH_ORGS.get('__tmp_org_placeholder__');
  const errors = jest.fn();

  beforeAll(async function () {
    await db.migrate.latest();
    githubEvents.removeListener('error', defaultErrorHandler);
    githubEvents.onError(errors);
    jest.spyOn(helpers, 'getAllProjectFieldNodeIds').mockReturnValue({
      'Product Area: Test': 1,
      'Product Area: Does Not Exist': 2,
      'Waiting for: Community': 3,
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
    octokit = await getClient(ClientType.App, 'test-org');
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
    let getKeyValueFromProjectFieldSpy,
      getIssueDetailsFromNodeIdSpy,
      octokitIssuesSpy;
    beforeAll(function () {
      getKeyValueFromProjectFieldSpy = jest.spyOn(
        helpers,
        'getKeyValueFromProjectField'
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
      expect(getKeyValueFromProjectFieldSpy).not.toHaveBeenCalled();
      expect(getIssueDetailsFromNodeIdSpy).not.toHaveBeenCalled();
      expect(octokitIssuesSpy).not.toHaveBeenCalled();
    });

    it('should ignore project event if it is issues project but not product area field id', async function () {
      octokitIssuesSpy = jest.spyOn(octokit.issues, 'addLabels');
      await editProjectField(org.project.node_id);
      expect(getKeyValueFromProjectFieldSpy).not.toHaveBeenCalled();
      expect(getIssueDetailsFromNodeIdSpy).not.toHaveBeenCalled();
      expect(octokitIssuesSpy).not.toHaveBeenCalled();
    });

    it('should not ignore project event if it is issues project and product field id', async function () {
      octokitIssuesSpy = jest.spyOn(octokit.issues, 'addLabels');
      getKeyValueFromProjectFieldSpy.mockReturnValue('Test');
      await editProjectField(
        org.project.node_id,
        org.project.product_area_field_id
      );
      expect(getKeyValueFromProjectFieldSpy).toHaveBeenCalled();
      expect(getIssueDetailsFromNodeIdSpy).toHaveBeenCalled();
      expect(octokitIssuesSpy).toHaveBeenCalled();
      expect(octokit.issues._labels).toContain('Product Area: Test');
    });

    it('should not ignore project event if it is issues project and status id', async function () {
      octokitIssuesSpy = jest.spyOn(octokit.issues, 'addLabels');
      getKeyValueFromProjectFieldSpy.mockReturnValue('Waiting for: Community');
      await editProjectField(org.project.node_id, org.project.status_field_id);
      expect(getKeyValueFromProjectFieldSpy).toHaveBeenCalled();
      expect(getIssueDetailsFromNodeIdSpy).toHaveBeenCalled();
      expect(octokitIssuesSpy).toHaveBeenCalled();
      expect(octokit.issues._labels).toContain('Waiting for: Community');
    });

    it('should handle project event if field value is unset', async function () {
      octokitIssuesSpy = jest.spyOn(octokit.issues, 'addLabels');
      getKeyValueFromProjectFieldSpy.mockReturnValue(undefined);
      await editProjectField(org.project.node_id, org.project.status_field_id);
      expect(getKeyValueFromProjectFieldSpy).toHaveBeenCalled();
      expect(getIssueDetailsFromNodeIdSpy).not.toHaveBeenCalled();
      expect(octokitIssuesSpy).not.toHaveBeenCalled();
    });
  });
});

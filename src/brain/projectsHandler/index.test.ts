import { createGitHubEvent } from '@test/utils/github';
import { MockedGithubOrg } from '@test/utils/testTypes';

import { buildServer } from '@/buildServer';
import { GETSENTRY_ORG } from '@/config';
import { Fastify } from '@/types';
import { defaultErrorHandler, githubEvents } from '@api/github';
import { db } from '@utils/db';

import { projectsHandler } from '.';

describe('projectsHandler', function () {
  let fastify: Fastify;
  const org = GETSENTRY_ORG as unknown as MockedGithubOrg;
  const errors = jest.fn();
  let origProject;

  beforeAll(async function () {
    await db.migrate.latest();
    githubEvents.onError(errors);
    origProject = org.project;
    org.project = {
      nodeId: 'test-project-node-id',
      fieldIds: {
        status: 'status-field-id',
        productArea: 'product-area-field-id',
        responseDue: 'response-due-field-id',
      },
    };
    jest.spyOn(org, 'getAllProjectFieldNodeIds').mockReturnValue({
      'Product Area: Test': 1,
      'Product Area: Does Not Exist': 2,
      'Waiting for: Community': 3,
    });
  });

  afterAll(async function () {
    githubEvents.onError(defaultErrorHandler);
    org.project = origProject;
    await db.destroy();
  });

  beforeEach(async function () {
    fastify = await buildServer(false);
    await projectsHandler();
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

  async function editProjectField(
    projectNodeId?: string,
    fieldNodeId?: string
  ) {
    const projectPayload = {
      organization: { login: GETSENTRY_ORG.slug },
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
      orgAPIIssuesSpy;
    beforeAll(function () {
      getKeyValueFromProjectFieldSpy = jest.spyOn(
        org,
        'getKeyValueFromProjectField'
      );
      getIssueDetailsFromNodeIdSpy = jest.spyOn(
        org,
        'getIssueDetailsFromNodeId'
      );
    });
    afterEach(function () {
      jest.clearAllMocks();
    });
    it('should ignore project event if it is not issues project', async function () {
      orgAPIIssuesSpy = jest.spyOn(org.api.issues, 'addLabels');
      await editProjectField();
      expect(getKeyValueFromProjectFieldSpy).not.toHaveBeenCalled();
      expect(getIssueDetailsFromNodeIdSpy).not.toHaveBeenCalled();
      expect(orgAPIIssuesSpy).not.toHaveBeenCalled();
    });

    it('should ignore project event if it is issues project but not product area field id', async function () {
      orgAPIIssuesSpy = jest.spyOn(org.api.issues, 'addLabels');
      await editProjectField(org.project.nodeId);
      expect(getKeyValueFromProjectFieldSpy).not.toHaveBeenCalled();
      expect(getIssueDetailsFromNodeIdSpy).not.toHaveBeenCalled();
      expect(orgAPIIssuesSpy).not.toHaveBeenCalled();
    });

    it('should not ignore project event if it is issues project and product field id', async function () {
      orgAPIIssuesSpy = jest.spyOn(org.api.issues, 'addLabels');
      getKeyValueFromProjectFieldSpy.mockReturnValue('Test');
      await editProjectField(
        org.project.nodeId,
        org.project.fieldIds.productArea
      );
      expect(getKeyValueFromProjectFieldSpy).toHaveBeenCalled();
      expect(getIssueDetailsFromNodeIdSpy).toHaveBeenCalled();
      expect(orgAPIIssuesSpy).toHaveBeenCalled();
      expect(org.api.issues._labels).toContain('Product Area: Test');
    });

    it('should not ignore project event if it is issues project and status id', async function () {
      orgAPIIssuesSpy = jest.spyOn(org.api.issues, 'addLabels');
      getKeyValueFromProjectFieldSpy.mockReturnValue('Waiting for: Community');
      await editProjectField(org.project.nodeId, org.project.fieldIds.status);
      expect(getKeyValueFromProjectFieldSpy).toHaveBeenCalled();
      expect(getIssueDetailsFromNodeIdSpy).toHaveBeenCalled();
      expect(orgAPIIssuesSpy).toHaveBeenCalled();
      expect(org.api.issues._labels).toContain('Waiting for: Community');
    });

    it('should handle project event if field value is unset', async function () {
      orgAPIIssuesSpy = jest.spyOn(org.api.issues, 'addLabels');
      getKeyValueFromProjectFieldSpy.mockReturnValue(undefined);
      await editProjectField(org.project.nodeId, org.project.fieldIds.status);
      expect(getKeyValueFromProjectFieldSpy).toHaveBeenCalled();
      expect(getIssueDetailsFromNodeIdSpy).not.toHaveBeenCalled();
      expect(orgAPIIssuesSpy).not.toHaveBeenCalled();
    });
  });
});

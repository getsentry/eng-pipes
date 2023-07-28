import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import * as Sentry from '@sentry/node';

import {
  AppAuthStrategyOptions,
  GitHubIssuesSomeoneElseCaresAbout,
  GitHubOrgConfig,
  GitHubOrgRepos,
} from '@/types';

// We can't use @ to import config here or we get an error from jest due to
// circular import or something. Try it out if you want. :)
import { FORCE_USER_TOKEN_GITHUB_CLIENT, GH_USER_CLIENT } from '../../config';

import { OctokitWithRetries } from './octokitWithRetries';

export class GitHubOrg {
  slug: string;
  appAuth: AppAuthStrategyOptions;
  project: GitHubIssuesSomeoneElseCaresAbout;
  repos: GitHubOrgRepos;

  // The docs say it's safe for Octokit instances to be long-lived:
  //
  // > Additionally, the SDK will take care of regenerating an installation
  // > access token for you so you don't need to worry about the one hour
  // > expiration.
  //
  // https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation#using-the-octokitjs-sdk-to-authenticate-as-an-app-installation
  api: Octokit;

  constructor(orgSlug: string, config: GitHubOrgConfig) {
    this.slug = orgSlug;
    this.appAuth = config.appAuth;
    this.project = config.project;
    this.repos = config.repos || {};
    if (!this.repos.withRouting) {
      this.repos.withRouting = [];
    }
    if (!this.repos.withoutRouting) {
      this.repos.withoutRouting = [];
    }
    this.repos.all = [...this.repos.withRouting, ...this.repos.withoutRouting];

    if (FORCE_USER_TOKEN_GITHUB_CLIENT) {
      // Hack for easier dev, avoids setting up a test org.
      this.api = GH_USER_CLIENT;
    } else {
      this.api = new OctokitWithRetries({
        authStrategy: createAppAuth,
        auth: this.appAuth,
      });
    }
  }

  // GraphQL helpers - We generally use the REST API, but the projects v2 API
  // is only available via GraphQL.

  async sendGraphQuery(query: string, data: object) {
    let response: any;
    try {
      response = await this.api.graphql(query);
    } catch (err) {
      Sentry.setContext('data', data);
      Sentry.captureException(err);
    }
    return response;
  }

  async addIssueToGlobalIssuesProject(
    issueNodeId: string | undefined,
    repo: string,
    issueNumber: number
  ): Promise<string> {
    if (issueNodeId == null) {
      Sentry.captureException(
        `Issue node id is not defined for ${repo}/${issueNumber}`
      );
    }
    const addIssueToGlobalIssuesProjectMutation = `mutation {
    addProjectV2ItemById(input: {projectId: "${this.project.nodeId}" contentId: "${issueNodeId}"}) {
        item {
          id
        }
      }
    }`;

    const data = {
      repo,
      issueNumber,
    };
    const response = await this.sendGraphQuery(
      addIssueToGlobalIssuesProjectMutation,
      data
    );

    return response?.addProjectV2ItemById.item.id;
  }

  async getAllProjectFieldNodeIds(projectFieldId: string) {
    const queryForProjectFieldNodeIDs = `query{
      node(id: "${projectFieldId}") {
        ... on ProjectV2SingleSelectField {
          options {
            id
            name
          }
        }
      }
    }`;

    const data = {
      projectFieldId,
    };
    const response = await this.sendGraphQuery(
      queryForProjectFieldNodeIDs,
      data
    );

    return response?.node.options.reduce((acc, { name, id }) => {
      acc[name] = id;
      return acc;
    }, {});
  }

  async modifyProjectIssueField(
    itemId: string,
    projectFieldOption: string,
    fieldId: string
  ) {
    const projectFieldNodeIDMapping = await this.getAllProjectFieldNodeIds(
      fieldId
    );
    const singleSelectOptionId = projectFieldNodeIDMapping[projectFieldOption];
    const modifyProjectIssueFieldMutation = `mutation {
      updateProjectV2ItemFieldValue(
        input: {
          projectId: "${this.project.nodeId}"
          itemId: "${itemId}"
          fieldId: "${fieldId}"
          value: {
            singleSelectOptionId: "${singleSelectOptionId}"
          }
        }
      ) {
        projectV2Item {
          id
        }
      }
    }`;
    const data = {
      itemId,
      projectFieldOption,
      fieldId,
    };
    await this.sendGraphQuery(modifyProjectIssueFieldMutation, data);
  }

  async clearProjectIssueField(
    itemId: string,
    projectFieldOption: string,
    fieldId: string
  ) {
    const modifyProjectIssueFieldMutation = `mutation {
      clearProjectV2ItemFieldValue(
        input: {
          projectId: "${this.project.nodeId}"
          itemId: "${itemId}"
          fieldId: "${fieldId}"
        }
      ) {
        projectV2Item {
          id
        }
      }
    }`;
    const data = {
      itemId,
      projectFieldOption,
      fieldId,
    };
    await this.sendGraphQuery(modifyProjectIssueFieldMutation, data);
  }

  async modifyDueByDate(
    itemId: string,
    projectFieldOption: string,
    fieldId: string
  ) {
    const modifyDueByDateMutation = `mutation {
      updateProjectV2ItemFieldValue(
        input: {
          projectId: "${this.project.nodeId}"
          itemId: "${itemId}"
          fieldId: "${fieldId}"
          value: {
            text: "${projectFieldOption}"
          }
        }
      ) {
        projectV2Item {
          id
        }
      }
    }`;

    const data = {
      itemId,
      projectFieldOption,
      fieldId,
    };
    await this.sendGraphQuery(modifyDueByDateMutation, data);
  }

  async getKeyValueFromProjectField(issueNodeId: string, fieldName: string) {
    const query = `query{
      node(id: "${issueNodeId}") {
          ... on ProjectV2Item {
            id
            fieldValueByName(name: "${fieldName}") {
              ... on ProjectV2ItemFieldSingleSelectValue {
                name
                field {
                  ... on ProjectV2FieldCommon {
                    name
                  }
                }
              }
            }
          }
        }
      }`;

    const data = {
      issueNodeId,
      fieldName,
    };
    const response = await this.sendGraphQuery(query, data);

    return response?.node.fieldValueByName?.name;
  }

  async getIssueDueDateFromProject(issueNodeId: string) {
    // Use fieldValues (and iterate) instead of fieldValuesByName in case the name ever changes
    const query = `query{
      node(id: "${issueNodeId}") {
        ... on ProjectV2Item {
          id
          fieldValues(first: 50) {
            nodes {
              ... on ProjectV2ItemFieldTextValue {
                id
                text
                field {
                  ... on ProjectV2Field {
                    id
                    name
                  }
                }
              }
            }
          }
        }
      }
    }`;

    const data = {
      issueNodeId,
    };
    const response = await this.sendGraphQuery(query, data);
    // When the response due date is empty, the node doesn't exist so we default to empty string
    const issueDueDateInfoNode =
      response?.node.fieldValues.nodes.find(
        (item) => item.field?.id === this.project.fieldIds.responseDue
      ) || '';
    return issueDueDateInfoNode.text;
  }

  async getIssueDetailsFromNodeId(issueNodeId: string) {
    const query = `query {
      node(id:"${issueNodeId}") {
        ... on Issue {
          number,
          repository {
            name
          }
        }
      }
    }`;

    const data = {
      issueNodeId,
    };
    const response = await this.sendGraphQuery(query, data);

    return {
      number: response?.node.number,
      repo: response?.node.repository?.name,
    };
  }
}

import { Octokit } from '@octokit/rest';
import * as Sentry from '@sentry/node';

import { GitHubOrg } from '@api/github/org';

async function sendQuery(query: string, data: object, octokit: Octokit) {
  let response: any;
  try {
    response = await octokit.graphql(query);
  } catch (err) {
    Sentry.setContext('data', data);
    Sentry.captureException(err);
  }
  return response;
}

export async function addIssueToGlobalIssuesProject(
  org: GitHubOrg,
  issueNodeId: string | undefined,
  repo: string,
  issueNumber: number,
  octokit: Octokit
): Promise<string> {
  if (issueNodeId == null) {
    Sentry.captureException(
      `Issue node id is not defined for ${repo}/${issueNumber}`
    );
  }
  const addIssueToGlobalIssuesProjectMutation = `mutation {
  addProjectV2ItemById(input: {projectId: "${org.project.node_id}" contentId: "${issueNodeId}"}) {
      item {
        id
      }
    }
  }`;

  const data = {
    repo,
    issueNumber,
  };
  const response = await sendQuery(
    addIssueToGlobalIssuesProjectMutation,
    data,
    octokit
  );

  return response?.addProjectV2ItemById.item.id;
}

export async function getAllProjectFieldNodeIds(
  projectFieldId: string,
  octokit: Octokit
) {
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
  const response = await sendQuery(queryForProjectFieldNodeIDs, data, octokit);

  return response?.node.options.reduce((acc, { name, id }) => {
    acc[name] = id;
    return acc;
  }, {});
}

export async function modifyProjectIssueField(
  org: GitHubOrg,
  itemId: string,
  projectFieldOption: string,
  fieldId: string,
  octokit: Octokit
) {
  const projectFieldNodeIDMapping = await getAllProjectFieldNodeIds(
    fieldId,
    octokit
  );
  const singleSelectOptionId = projectFieldNodeIDMapping[projectFieldOption];
  const modifyProjectIssueFieldMutation = `mutation {
    updateProjectV2ItemFieldValue(
      input: {
        projectId: "${org.project.node_id}"
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
  await sendQuery(modifyProjectIssueFieldMutation, data, octokit);
}

export async function modifyDueByDate(
  org: GitHubOrg,
  itemId: string,
  projectFieldOption: string,
  fieldId: string,
  octokit: Octokit
) {
  const modifyDueByDateMutation = `mutation {
    updateProjectV2ItemFieldValue(
      input: {
        projectId: "${org.project.node_id}"
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
  await sendQuery(modifyDueByDateMutation, data, octokit);
}

export async function getKeyValueFromProjectField(
  issueNodeId: string,
  fieldName: string,
  octokit: Octokit
) {
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
  const response = await sendQuery(query, data, octokit);

  return response?.node.fieldValueByName?.name;
}

export async function getIssueDueDateFromProject(
  org: GitHubOrg,
  issueNodeId: string,
  octokit: Octokit
) {
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
  const response = await sendQuery(query, data, octokit);
  // When the response due date is empty, the node doesn't exist so we default to empty string
  const issueDueDateInfoNode =
    response?.node.fieldValues.nodes.find(
      (item) => item.field?.id === org.project.response_due_date_field_id
    ) || '';
  return issueDueDateInfoNode.text;
}

export async function getIssueDetailsFromNodeId(
  issueNodeId: string,
  octokit: Octokit
) {
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
  const response = await sendQuery(query, data, octokit);

  return {
    number: response?.node.number,
    repo: response?.node.repository?.name,
  };
}
import * as Sentry from '@sentry/node';

import { GitHubOrg } from '@api/github/org';

export async function addIssueToGlobalIssuesProject(
  org: GitHubOrg,
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
  const response = await org.sendGraphQuery(
    addIssueToGlobalIssuesProjectMutation,
    data
  );

  return response?.addProjectV2ItemById.item.id;
}

export async function getAllProjectFieldNodeIds(
  org: GitHubOrg,
  projectFieldId: string
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
  const response = await org.sendGraphQuery(queryForProjectFieldNodeIDs, data);

  return response?.node.options.reduce((acc, { name, id }) => {
    acc[name] = id;
    return acc;
  }, {});
}

export async function modifyProjectIssueField(
  org: GitHubOrg,
  itemId: string,
  projectFieldOption: string,
  fieldId: string
) {
  const projectFieldNodeIDMapping = await getAllProjectFieldNodeIds(
    org,
    fieldId
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
  await org.sendGraphQuery(modifyProjectIssueFieldMutation, data);
}

export async function modifyDueByDate(
  org: GitHubOrg,
  itemId: string,
  projectFieldOption: string,
  fieldId: string
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
  await org.sendGraphQuery(modifyDueByDateMutation, data);
}

export async function getKeyValueFromProjectField(
  org: GitHubOrg,
  issueNodeId: string,
  fieldName: string
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
  const response = await org.sendGraphQuery(query, data);

  return response?.node.fieldValueByName?.name;
}

export async function getIssueDueDateFromProject(
  org: GitHubOrg,
  issueNodeId: string
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
  const response = await org.sendGraphQuery(query, data);
  // When the response due date is empty, the node doesn't exist so we default to empty string
  const issueDueDateInfoNode =
    response?.node.fieldValues.nodes.find(
      (item) => item.field?.id === org.project.response_due_date_field_id
    ) || '';
  return issueDueDateInfoNode.text;
}

export async function getIssueDetailsFromNodeId(
  org: GitHubOrg,
  issueNodeId: string
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
  const response = await org.sendGraphQuery(query, data);

  return {
    number: response?.node.number,
    repo: response?.node.repository?.name,
  };
}

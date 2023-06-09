import { Octokit } from '@octokit/rest';
import * as Sentry from '@sentry/node';

import {
  ISSUES_PROJECT_NODE_ID,
} from '@/config';
import { getOssUserType } from '@utils/getOssUserType';

// Validation Helpers

export async function shouldSkip(payload, reasonsToSkip) {
  // Could do Promise-based async here, but that was getting complicated[1] and
  // there's not really a performance concern (famous last words).
  //
  // [1] https://github.com/getsentry/eng-pipes/pull/212#discussion_r657365585

  for (const skipIf of reasonsToSkip) {
    if (await skipIf(payload)) {
      return true;
    }
  }
  return false;
}

export async function isNotFromAnExternalOrGTMUser(payload: object) {
  const type = await getOssUserType(payload);
  return !(type === 'external' || type === 'gtm');
}

export async function addIssueToGlobalIssuesProject(
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
  addProjectV2ItemById(input: {projectId: "${ISSUES_PROJECT_NODE_ID}" contentId: "${issueNodeId}"}) {
      item {
        id
      }
    }
  }`;

  let response: any;

  try {
    response = await octokit.graphql(addIssueToGlobalIssuesProjectMutation);
  } catch (err) {
    Sentry.setContext('data', {
      repo: repo,
      issueNumber: issueNumber
    });
    Sentry.captureException(err);
  }

  return response.addProjectV2ItemById.item.id;
}

export async function getAllProjectFieldNodeIds(projectFieldId: string, octokit: Octokit) {
  const queryForPrjectFieldNodeIDs = `query{
    node(id: "${projectFieldId}") {
      ... on ProjectV2SingleSelectField {
        options {
          id
          name
        }
      }
    }
  }`;

  let response: any;

  try {
    response = await octokit.graphql(queryForPrjectFieldNodeIDs);
  } catch (err) {
    Sentry.setContext('data', {
      projectFieldId: projectFieldId
    });
    Sentry.captureException(err);
  }

  return response?.node.options.reduce((acc, { name, id }) => {
    acc[name] = id;
    return acc;
  }, {});
}

export async function modifyProjectIssueField(
  itemId: string,
  projectFieldOption: string,
  fieldId: string,
  octokit: Octokit
) {
  const projectFieldNodeIDMapping = await getAllProjectFieldNodeIds(fieldId, octokit);
  const singleSelectOptionId = projectFieldNodeIDMapping[projectFieldOption];
  const addIssueToGlobalIssuesProjectMutation = `mutation {
    updateProjectV2ItemFieldValue(
      input: {
        projectId: "${ISSUES_PROJECT_NODE_ID}"
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
  try {
    await octokit.graphql(addIssueToGlobalIssuesProjectMutation);
  } catch (err) {
    Sentry.setContext('data', {
      itemId: itemId,
      fieldId: fieldId,
      projectFieldOption: projectFieldOption,
      singleSelectOptionId: singleSelectOptionId,
    });
    Sentry.captureException(err);
  }
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

  let response: any;

  try {
    response = await octokit.graphql(query);
  } catch (err) {
    Sentry.setContext('data', {
      issueNodeId: issueNodeId,
      fieldName: fieldName,
    });
    Sentry.captureException(err);
  }
  return response?.node.fieldValueByName?.name;
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

  let response: any;
  try {
    response = await octokit.graphql(query);
  } catch(err) {
    Sentry.setContext('data', {
      issueNodeId: issueNodeId,
    });
    Sentry.captureException(err);
  }
  return {
    number: response?.node.number,
    repo: response?.node.repository?.name,
  };
}

import {
  ISSUES_PROJECT_NODE_ID,
  PRODUCT_AREA_FIELD_ID,
  PRODUCT_AREA_LABEL_PREFIX,
} from '@/config';
import { getOssUserType } from '@utils/getOssUserType';
import { Octokit } from '@octokit/rest';
import * as Sentry from '@sentry/node';

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

export function getProductArea(productAreaLabelName) {
  return productAreaLabelName?.substr(PRODUCT_AREA_LABEL_PREFIX.length);
}

export async function addIssueToProject(issueNodeId: string | undefined, repo: string, issueNumber: number, octokit: Octokit): Promise<string>{
  if (issueNodeId == null) {
    Sentry.captureException(`Issue node id is not defined for ${repo}/${issueNumber}`);
  }
  const addIssueToprojectMutation = `mutation {
  addProjectV2ItemById(input: {projectId: "${ISSUES_PROJECT_NODE_ID}" contentId: "${issueNodeId}"}) {
      item {
        id
      }
    }
  }`;

  const response: any = await octokit.graphql(addIssueToprojectMutation);

  return response.addProjectV2ItemById.item.id;
}

export async function getAllProductAreaNodeIds(octokit: Octokit) {
  const queryForProductAreaNodeIDs = `query{
    node(id: "${PRODUCT_AREA_FIELD_ID}") {
      ... on ProjectV2SingleSelectField {
        options {
          id
          name
        }
      }
    }
  }`;

  const response: any = await octokit.graphql(queryForProductAreaNodeIDs);
  return response.node.options.reduce((acc, { name, id }) => {
    acc[name] = id;
    return acc;
  }, {});
}

export async function modifyProjectIssueProductArea(
  itemId: string,
  productAreaLabelName: string,
  octokit: Octokit
) {
  const productArea = getProductArea(productAreaLabelName);
  const productAreaNodeIDMapping = await getAllProductAreaNodeIds(octokit);
  const addIssueToprojectMutation = `mutation {
    updateProjectV2ItemFieldValue(
      input: {
        projectId: "${ISSUES_PROJECT_NODE_ID}"
        itemId: "${itemId}"
        fieldId: "${PRODUCT_AREA_FIELD_ID}"
        value: {
          singleSelectOptionId: "${productAreaNodeIDMapping[productArea]}"
        }
      }
    ) {
      projectV2Item {
        id
      }
    }
  }`;

  await octokit.graphql(addIssueToprojectMutation);
}

export async function getProductAreaFromProjectField(issueNodeId: string, octokit: Octokit) {
  const query = `query{
    node(id: "${issueNodeId}") {
        ... on ProjectV2Item {
          id
          fieldValueByName(name: "Product Area") {
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

  const response: any = await octokit.graphql(query);
  return response?.node.fieldValueByName?.name;
}

export async function getIssueDetailsFromNodeId(issueNodeId: string, octokit: Octokit) {
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

  const response: any = await octokit.graphql(query);
  return {
    number: response?.node.number,
    repo: response?.node.repository?.name
  }
}

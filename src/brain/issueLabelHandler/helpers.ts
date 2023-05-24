import {
  ISSUES_PROJECT_NODE_ID,
  PRODUCT_AREA_FIELD_ID,
  PRODUCT_AREA_LABEL_PREFIX,
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

export async function isNotFromAnExternalOrGTMUser(payload) {
  const type = await getOssUserType(payload);
  return !(type === 'external' || type === 'gtm');
}

export function getProductArea(productAreaLabelName) {
  return productAreaLabelName?.substr(PRODUCT_AREA_LABEL_PREFIX.length);
}

export async function addIssueToProject(issueNodeID, octokit) {
  const addIssueToprojectMutation = `mutation {
  addProjectV2ItemById(input: {projectId: "${ISSUES_PROJECT_NODE_ID}" contentId: "${issueNodeID}"}) {
      item {
        id
      }
    }
  }`;

  return await octokit.graphql(addIssueToprojectMutation);
}

async function getAllProductAreaNodeIDs(octokit) {
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

  const data = await octokit.graphql(queryForProductAreaNodeIDs);
  return data.node.options.reduce((acc, { name, id }) => {
    acc[name] = id;
    return acc;
  }, {});
}

export async function modifyProjectIssueProductArea(
  issueNodeID,
  productAreaLabelName,
  octokit
) {
  const productArea = getProductArea(productAreaLabelName);
  const productAreaNodeIDMapping = await getAllProductAreaNodeIDs(octokit);
  const addIssueToprojectMutation = `mutation {
    updateProjectV2ItemFieldValue(
      input: {
        projectId: "${ISSUES_PROJECT_NODE_ID}"
        itemId: "${issueNodeID}"
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

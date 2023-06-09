import { EmitterWebhookEvent } from '@octokit/webhooks';
import * as Sentry from '@sentry/node';

import { ClientType } from '@/api/github/clientType';
import {
  PRODUCT_AREA_LABEL_PREFIX,
  STATUS_FIELD_ID,
  ISSUES_PROJECT_NODE_ID,
  PRODUCT_AREA_FIELD_ID,
} from '@/config';
import { shouldSkip } from '@/utils/githubEventHelpers';
import { getClient } from '@api/github/getClient';
import {
  getIssueDetailsFromNodeId,
  getKeyValueFromProjectField,
} from '@utils/githubEventHelpers';

function isNotInAProjectWeCareAbout(payload) {
  return payload?.projects_v2_item?.project_node_id !== ISSUES_PROJECT_NODE_ID;
}

function isNotAProjectFieldWeCareAbout(payload) {
  return payload?.changes?.field_value?.field_node_id !== PRODUCT_AREA_FIELD_ID && payload?.changes?.field_value?.field_node_id !== STATUS_FIELD_ID;
}

function getFieldName(payload) {
  if (payload?.changes?.field_value?.field_node_id === PRODUCT_AREA_FIELD_ID) {
    return "Product Area";
  }
  else if (payload?.changes?.field_value?.field_node_id === STATUS_FIELD_ID) {
    return "Status";
  }
  return "";
}

function isMissingNodeId(payload) {
  return (
    payload?.projects_v2_item?.node_id == null ||
    payload?.projects_v2_item?.content_node_id == null
  );
}

export async function syncLabelsWithProjectField({
  id,
  payload,
  ...rest
}: EmitterWebhookEvent<'projects_v2_item.edited'>) {
  const tx = Sentry.startTransaction({
    op: 'brain',
    name: 'issueLabelHandler.syncLabelsWithProjectField',
  });

  const reasonsToDoNothing = [
    isNotInAProjectWeCareAbout,
    isNotAProjectFieldWeCareAbout,
    isMissingNodeId,
  ];
  if (await shouldSkip(payload, reasonsToDoNothing)) {
    return;
  }

  const owner = payload?.organization?.login || '';
  const octokit = await getClient(ClientType.App, owner);
  const fieldName = getFieldName(payload);
  const fieldValue = await getKeyValueFromProjectField(
    payload.projects_v2_item.node_id,
    fieldName,
    octokit
  );

  // Single select field value has been unset, so don't do anything
  if (fieldValue == null) {
    return;
  }

  const issueInfo = await getIssueDetailsFromNodeId(
    payload.projects_v2_item.content_node_id,
    octokit
  );

  await octokit.issues.addLabels({
    owner,
    repo: issueInfo.repo,
    issue_number: issueInfo.number,
    labels: [`${fieldName === "Product Area" ? PRODUCT_AREA_LABEL_PREFIX : ""}${fieldValue}`],
  });

  tx.finish();
}

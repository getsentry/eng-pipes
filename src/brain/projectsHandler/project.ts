import { EmitterWebhookEvent } from '@octokit/webhooks';
import * as Sentry from '@sentry/node';

import { GH_ORGS, PRODUCT_AREA_LABEL_PREFIX } from '@/config';
import { ClientType } from '@api/github/clientType';
import { getClient } from '@api/github/getClient';
import { shouldSkip } from '@utils/githubEventHelpers';
import {
  getIssueDetailsFromNodeId,
  getKeyValueFromProjectField,
} from '@utils/githubEventHelpers';

function isNotInAProjectWeCareAbout(payload, org) {
  return payload?.projects_v2_item?.project_node_id !== org.project.node_id;
}

function isNotAProjectFieldWeCareAbout(payload, org) {
  return (
    payload?.changes?.field_value?.field_node_id !==
      org.project.product_area_field_id &&
    payload?.changes?.field_value?.field_node_id !== org.project.status_field_id
  );
}

function getFieldName(payload, org) {
  if (
    payload?.changes?.field_value?.field_node_id ===
    org.project.product_area_field_id
  ) {
    return 'Product Area';
  } else if (
    payload?.changes?.field_value?.field_node_id === org.project.status_field_id
  ) {
    return 'Status';
  }
  return '';
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

  const org = GH_ORGS.getForPayload(payload);

  const reasonsToDoNothing = [
    isNotInAProjectWeCareAbout,
    isNotAProjectFieldWeCareAbout,
    isMissingNodeId,
  ];
  if (await shouldSkip(payload, org, reasonsToDoNothing)) {
    return;
  }

  const owner = payload?.organization?.login || '';
  const octokit = await getClient(ClientType.App, owner);
  const fieldName = getFieldName(payload, org);
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
    labels: [
      `${
        fieldName === 'Product Area' ? PRODUCT_AREA_LABEL_PREFIX : ''
      }${fieldValue}`,
    ],
  });

  tx.finish();
}

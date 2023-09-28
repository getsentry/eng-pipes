import '@sentry/tracing';

import { EmitterWebhookEvent } from '@octokit/webhooks';
import * as Sentry from '@sentry/node';

import { GH_ORGS, PRODUCT_AREA_LABEL_PREFIX } from '@/config';
import { shouldSkip } from '@utils/shouldSkip';

function isNotInAProjectWeCareAbout(payload, org) {
  return payload?.projects_v2_item?.project_node_id !== org.project.nodeId;
}

function isNotAProjectFieldWeCareAbout(payload, org) {
  return (
    payload?.changes?.field_value?.field_node_id !==
      org.project.fieldIds.productArea &&
    payload?.changes?.field_value?.field_node_id !== org.project.fieldIds.status
  );
}

function getFieldName(payload, org) {
  if (
    payload?.changes?.field_value?.field_node_id ===
    org.project.fieldIds.productArea
  ) {
    return 'Product Area';
  } else if (
    payload?.changes?.field_value?.field_node_id === org.project.fieldIds.status
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
  payload,
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

  const fieldName = getFieldName(payload, org);
  const fieldValue = await org.getKeyValueFromProjectField(
    payload.projects_v2_item.node_id,
    fieldName
  );

  // Single select field value has been unset, so don't do anything
  if (fieldValue == null) {
    return;
  }

  const issueInfo = await org.getIssueDetailsFromNodeId(
    payload.projects_v2_item.content_node_id
  );

  await org.api.issues.addLabels({
    owner: org.slug,
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

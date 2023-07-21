import { EmitterWebhookEvent } from '@octokit/webhooks';
import * as Sentry from '@sentry/node';

import { GH_APPS, PRODUCT_AREA_LABEL_PREFIX } from '@/config';
import { ClientType } from '@api/github/clientType';
import { getClient } from '@api/github/getClient';
import {
  getIssueDetailsFromNodeId,
  getKeyValueFromProjectField,
  shouldSkip,
} from '@utils/githubEventHelpers';

function isNotInAProjectWeCareAbout(payload, app) {
  return payload?.projects_v2_item?.project_node_id !== app.project.node_id;
}

function isNotAProjectFieldWeCareAbout(payload, app) {
  return (
    payload?.changes?.field_value?.field_node_id !==
      app.project.product_area_field_id &&
    payload?.changes?.field_value?.field_node_id !== app.project.status_field_id
  );
}

function getFieldName(payload, app) {
  if (
    payload?.changes?.field_value?.field_node_id ===
    app.project.product_area_field_id
  ) {
    return 'Product Area';
  } else if (
    payload?.changes?.field_value?.field_node_id === app.project.status_field_id
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

  const app = GH_APPS.getForPayload(payload);

  const reasonsToDoNothing = [
    isNotInAProjectWeCareAbout,
    isNotAProjectFieldWeCareAbout,
    isMissingNodeId,
  ];
  if (await shouldSkip(payload, app, reasonsToDoNothing)) {
    return;
  }

  const octokit = await getClient(ClientType.App, app.org);
  const fieldName = getFieldName(payload, app);
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
    owner: app.org,
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

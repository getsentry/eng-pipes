import { EmitterWebhookEvent } from '@octokit/webhooks';
import * as Sentry from '@sentry/node';

import { ClientType } from '@/api/github/clientType';
import { ISSUES_PROJECT_NODE_ID, PRODUCT_AREA_FIELD_ID } from '@/config';
import { PRODUCT_AREA_LABEL_PREFIX } from '@/config';
import { shouldSkip } from '@/utils/githubEventHelpers';
import { getClient } from '@api/github/getClient';
import {
  getIssueDetailsFromNodeId,
  getProductAreaFromProjectField,
} from '@utils/githubEventHelpers';

function isNotInAProjectWeCareAbout(payload) {
  return payload?.projects_v2_item?.project_node_id !== ISSUES_PROJECT_NODE_ID;
}

function isNotAProjectFieldWeCareAbout(payload) {
  return payload?.changes?.field_value?.field_node_id !== PRODUCT_AREA_FIELD_ID;
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
  const productArea = await getProductAreaFromProjectField(
    payload.projects_v2_item.node_id,
    octokit
  );
  const issueInfo = await getIssueDetailsFromNodeId(
    payload.projects_v2_item.content_node_id,
    octokit
  );

  await octokit.issues.addLabels({
    owner,
    repo: issueInfo.repo,
    issue_number: issueInfo.number,
    labels: [`${PRODUCT_AREA_LABEL_PREFIX}${productArea}`],
  });

  tx.finish();
}
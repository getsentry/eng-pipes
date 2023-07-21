import { EmitterWebhookEvent } from '@octokit/webhooks';
import * as Sentry from '@sentry/node';

import {
  GH_ORGS,
  SENTRY_REPOS_WITHOUT_ROUTING,
  WAITING_FOR_PRODUCT_OWNER_LABEL,
} from '@/config';
import { ClientType } from '@api/github/clientType';
import { getClient } from '@api/github/getClient';
import {
  addIssueToGlobalIssuesProject,
  modifyProjectIssueField,
  shouldSkip,
} from '@utils/githubEventHelpers';
import { isFromABot } from '@utils/isFromABot';
import { isNotFromAnExternalOrGTMUser } from '@utils/isNotFromAnExternalOrGTMUser';

function isAlreadyUntriaged(payload) {
  return !isAlreadyTriaged(payload);
}

function isAlreadyTriaged(payload) {
  return !payload.issue.labels.some(
    ({ name }) => name === WAITING_FOR_PRODUCT_OWNER_LABEL
  );
}

function isNotInARepoWeCareAboutForTriage(payload) {
  return !SENTRY_REPOS_WITHOUT_ROUTING.has(payload.repository.name);
}

function isWaitingForProductOwnerLabel(payload) {
  return payload.label?.name === WAITING_FOR_PRODUCT_OWNER_LABEL;
}

// Markers of State

export async function markWaitingForProductOwner({
  id,
  payload,
  ...rest
}: EmitterWebhookEvent<'issues.opened'>) {
  const tx = Sentry.startTransaction({
    op: 'brain',
    name: 'issueLabelHandler.markWaitingforProductOwner',
  });

  const org = GH_ORGS.getForPayload(payload);

  const reasonsToSkipTriage = [
    isNotInARepoWeCareAboutForTriage,
    isAlreadyUntriaged,
    isNotFromAnExternalOrGTMUser,
  ];
  if (await shouldSkip(payload, org, reasonsToSkipTriage)) {
    return;
  }

  // New issues get an Untriaged label.
  const owner = payload.repository.owner.login;
  const octokit = await getClient(ClientType.App, owner);
  const repo = payload.repository.name;
  const issueNumber = payload.issue.number;

  await octokit.issues.addLabels({
    owner,
    repo: repo,
    issue_number: issueNumber,
    labels: [WAITING_FOR_PRODUCT_OWNER_LABEL],
  });

  const itemId: string = await addIssueToGlobalIssuesProject(
    org,
    payload.issue.node_id,
    repo,
    issueNumber,
    octokit
  );

  await modifyProjectIssueField(
    org,
    itemId,
    WAITING_FOR_PRODUCT_OWNER_LABEL,
    org.project.status_field_id,
    octokit
  );

  tx.finish();
}

export async function markNotWaitingForProductOwner({
  id,
  payload,
  ...rest
}: EmitterWebhookEvent<'issues.labeled'>) {
  const tx = Sentry.startTransaction({
    op: 'brain',
    name: 'issueLabelHandler.markNotWaitingForProductOwner',
  });

  const org = GH_ORGS.getForPayload(payload);

  const reasonsToSkip = [
    isNotInARepoWeCareAboutForTriage,
    isFromABot,
    isWaitingForProductOwnerLabel,
    isAlreadyTriaged,
  ];
  if (await shouldSkip(payload, org, reasonsToSkip)) {
    return;
  }

  // Remove Untriaged label when triaged.
  const owner = payload.repository.owner.login;
  const octokit = await getClient(ClientType.App, owner);
  try {
    await octokit.issues.removeLabel({
      owner: owner,
      repo: payload.repository.name,
      issue_number: payload.issue.number,
      name: WAITING_FOR_PRODUCT_OWNER_LABEL,
    });
  } catch (error) {
    // @ts-expect-error
    if (error.status === 404) {
      // The label has already been removed. This can happen pretty easily if
      // a user adds two labels roughly simultaneously, because then we get
      // two labeled events and we end up with a race condition. We can
      // safely ignore because the label has been removed and that's all we
      // ever really wanted in life.
    } else {
      throw error;
    }
  }

  tx.finish();
}

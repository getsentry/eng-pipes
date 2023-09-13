import { EmitterWebhookEvent } from '@octokit/webhooks';
import * as Sentry from '@sentry/node';

import { GH_ORGS, WAITING_FOR_PRODUCT_OWNER_LABEL } from '@/config';
import { isFromOutsideCollaborator } from '@/utils/isFromOutsideCollaborator';
import { isFromABot } from '@utils/isFromABot';
import { isNotFromAnExternalOrGTMUser } from '@utils/isNotFromAnExternalOrGTMUser';
import { shouldSkip } from '@utils/shouldSkip';

function isAlreadyUntriaged(payload) {
  return !isAlreadyTriaged(payload);
}

function isAlreadyTriaged(payload) {
  return !payload.issue.labels.some(
    ({ name }) => name === WAITING_FOR_PRODUCT_OWNER_LABEL
  );
}

function isNotInARepoWeCareAboutForTriage(payload, org) {
  return !org.repos.withoutRouting.includes(payload.repository.name);
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
    isFromOutsideCollaborator,
  ];
  if (await shouldSkip(payload, org, reasonsToSkipTriage)) {
    return;
  }

  // New issues get an Untriaged label.
  const repo = payload.repository.name;
  const issueNumber = payload.issue.number;

  await org.api.issues.addLabels({
    owner: org.slug,
    repo: repo,
    issue_number: issueNumber,
    labels: [WAITING_FOR_PRODUCT_OWNER_LABEL],
  });

  const itemId: string = await org.addIssueToGlobalIssuesProject(
    payload.issue.node_id,
    repo,
    issueNumber
  );

  await org.modifyProjectIssueField(
    itemId,
    WAITING_FOR_PRODUCT_OWNER_LABEL,
    org.project.fieldIds.status
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
  try {
    await org.api.issues.removeLabel({
      owner: org.slug,
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

import { EmitterWebhookEvent } from '@octokit/webhooks';
import * as Sentry from '@sentry/node';

import {
  GH_APPS,
  SENTRY_SDK_REPOS,
  WAITING_FOR_PRODUCT_OWNER_LABEL,
} from '@/config';
import { ClientType } from '@api/github/clientType';
import { getClient } from '@api/github/getClient';
import {
  isNotFromAnExternalOrGTMUser,
  modifyProjectIssueField,
  shouldSkip,
} from '@utils/githubEventHelpers';
import { addIssueToGlobalIssuesProject } from '@utils/githubEventHelpers';
import { isFromABot } from '@utils/isFromABot';

const REPOS_TO_TRACK_FOR_TRIAGE = new Set(SENTRY_SDK_REPOS);

function isAlreadyUntriaged(payload) {
  return !isAlreadyTriaged(payload);
}

function isAlreadyTriaged(payload) {
  return !payload.issue.labels.some(
    ({ name }) => name === WAITING_FOR_PRODUCT_OWNER_LABEL
  );
}

function isNotInARepoWeCareAboutForTriage(payload) {
  return !REPOS_TO_TRACK_FOR_TRIAGE.has(payload.repository.name);
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

  const app = GH_APPS.getForPayload(payload);

  const reasonsToSkipTriage = [
    isNotInARepoWeCareAboutForTriage,
    isAlreadyUntriaged,
    isNotFromAnExternalOrGTMUser,
  ];
  if (await shouldSkip(payload, app, reasonsToSkipTriage)) {
    return;
  }

  // New issues get an Untriaged label.
  const octokit = await getClient(ClientType.App, app.org);
  const repo = payload.repository.name;
  const issueNumber = payload.issue.number;

  await octokit.issues.addLabels({
    owner: app.org,
    repo,
    issue_number: issueNumber,
    labels: [WAITING_FOR_PRODUCT_OWNER_LABEL],
  });

  const itemId: string = await addIssueToGlobalIssuesProject(
    app,
    payload.issue.node_id,
    repo,
    issueNumber,
    octokit
  );

  await modifyProjectIssueField(
    app,
    itemId,
    WAITING_FOR_PRODUCT_OWNER_LABEL,
    app.project.status_field_id,
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

  const app = GH_APPS.getForPayload(payload);

  const reasonsToSkip = [
    isNotInARepoWeCareAboutForTriage,
    isFromABot,
    isWaitingForProductOwnerLabel,
    isAlreadyTriaged,
  ];
  if (await shouldSkip(payload, app, reasonsToSkip)) {
    return;
  }

  // Remove Untriaged label when triaged.
  const octokit = await getClient(ClientType.App, app.org);
  try {
    await octokit.issues.removeLabel({
      owner: app.org,
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

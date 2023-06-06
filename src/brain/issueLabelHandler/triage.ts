import { EmitterWebhookEvent } from '@octokit/webhooks';
import * as Sentry from '@sentry/node';

import {
  isNotFromAnExternalOrGTMUser,
  shouldSkip,
  modifyProjectIssueField,
} from '@/utils/githubEventHelpers';
import { isFromABot } from '@utils/isFromABot';
import { SENTRY_REPOS } from '@/config';

import { ClientType } from '@/api/github/clientType';
import {
  UNTRIAGED_LABEL,
  WAITING_FOR_PRODUCT_OWNER_LABEL,
  STATUS_FIELD_ID,
} from '@/config';
import { getClient } from '@api/github/getClient';
import { addIssueToGlobalIssuesProject } from '@/utils/githubEventHelpers';

const REPOS_TO_TRACK_FOR_TRIAGE = new Set(SENTRY_REPOS);

function isAlreadyUntriaged(payload) {
  return !isAlreadyTriaged(payload);
}

function isAlreadyTriaged(payload) {
  return !payload.issue.labels.some(({ name }) => name === UNTRIAGED_LABEL);
}

function isNotInARepoWeCareAboutForTriage(payload) {
  return !REPOS_TO_TRACK_FOR_TRIAGE.has(payload.repository.name);
}

function isTheUntriagedLabel(payload) {
  return payload.label?.name === UNTRIAGED_LABEL;
}

// Markers of State

export async function markUntriaged({
  id,
  payload,
  ...rest
}: EmitterWebhookEvent<'issues.opened'>) {
  const tx = Sentry.startTransaction({
    op: 'brain',
    name: 'issueLabelHandler.markUntriaged',
  });

  const reasonsToSkipTriage = [
    isNotInARepoWeCareAboutForTriage,
    isAlreadyUntriaged,
    isNotFromAnExternalOrGTMUser,
  ];
  if (await shouldSkip(payload, reasonsToSkipTriage)) {
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
    labels: [UNTRIAGED_LABEL, WAITING_FOR_PRODUCT_OWNER_LABEL],
  });

  const itemId: string = await addIssueToGlobalIssuesProject(payload.issue.node_id, repo, issueNumber, octokit);

  await modifyProjectIssueField(
    itemId,
    WAITING_FOR_PRODUCT_OWNER_LABEL,
    STATUS_FIELD_ID,
    octokit
  );

  tx.finish();
}

export async function markTriaged({
  id,
  payload,
  ...rest
}: EmitterWebhookEvent<'issues.labeled'>) {
  const tx = Sentry.startTransaction({
    op: 'brain',
    name: 'issueLabelHandler.markTriaged',
  });

  const reasonsToSkip = [
    isNotInARepoWeCareAboutForTriage,
    isFromABot,
    isTheUntriagedLabel,
    isAlreadyTriaged,
  ];
  if (await shouldSkip(payload, reasonsToSkip)) {
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
      name: UNTRIAGED_LABEL,
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

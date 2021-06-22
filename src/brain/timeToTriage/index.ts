import { EmitterWebhookEvent } from '@octokit/webhooks';
import * as Sentry from '@sentry/node';

import { githubEvents } from '@api/github';
import { getOssUserType } from '@utils/getOssUserType';
import { isFromABot } from '@utils/isFromABot';

const REPOS_TO_TRACK = new Set(['test-ttt-simple']);
import { UNTRIAGED_LABEL } from '@/config';
import { getClient } from '@api/github/getClient';

// Validation Helpers

async function isInvalid(payload, invalidators) {
  for (const invalidate of invalidators) {
    if (await invalidate(payload)) {
      return true;
    }
  }
  return false;
}

async function isAlreadyTriaged(payload) {
  return !payload.issue.labels.some(({ name }) => name === UNTRIAGED_LABEL);
}

async function isNotFromAnExternalUser(payload) {
  return (await getOssUserType(payload)) !== 'external';
}

async function isNotInARepoWeCareAbout(payload) {
  return !REPOS_TO_TRACK.has(payload.repository?.name);
}

async function isTheUntriagedLabel(payload) {
  return payload.label?.name === UNTRIAGED_LABEL;
}

// Markers of State

async function markUntriaged({
  id,
  payload,
  ...rest
}: EmitterWebhookEvent<'issues.opened'>) {
  const tx = Sentry.startTransaction({
    op: 'brain',
    name: 'timeToTriage.markUntriaged',
  });

  const invalidators = [isNotInARepoWeCareAbout, isNotFromAnExternalUser];
  if (await isInvalid(payload, invalidators)) {
    return;
  }

  // New issues get an Untriaged label.
  const owner = payload.repository.owner.login;
  const octokit = await getClient(owner);

  await octokit.issues.addLabels({
    owner,
    repo: payload.repository.name,
    issue_number: payload.issue.number,
    labels: [UNTRIAGED_LABEL],
  });

  tx.finish();
}

async function markTriaged({
  id,
  payload,
  ...rest
}: EmitterWebhookEvent<'issues.labeled'>) {
  const tx = Sentry.startTransaction({
    op: 'brain',
    name: 'timeToTriage.markTriaged',
  });

  const invalidators = [
    isNotInARepoWeCareAbout,
    isFromABot,
    isTheUntriagedLabel,
    isAlreadyTriaged,
  ];
  if (await isInvalid(payload, invalidators)) {
    return;
  }

  // Remove Untriaged label when triaged.
  const owner = payload.repository.owner.login;
  const octokit = await getClient(owner);
  await octokit.issues.removeLabel({
    owner: owner,
    repo: payload.repository.name,
    issue_number: payload.issue.number,
    name: UNTRIAGED_LABEL,
  });

  tx.finish();
}

// Install.

export async function timeToTriage() {
  githubEvents.removeListener('issues.opened', markUntriaged);
  githubEvents.on('issues.opened', markUntriaged);
  githubEvents.removeListener('issues.labeled', markTriaged);
  githubEvents.on('issues.labeled', markTriaged);
}

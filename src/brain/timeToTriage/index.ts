import { EmitterWebhookEvent } from '@octokit/webhooks';
import * as Sentry from '@sentry/node';

import { githubEvents } from '@api/github';
import { getOssUserType, isFromBot } from '@utils/getOssUserType';

const REPOS_TO_TRACK = new Set(['test-ttt-simple']);
import { UNTRIAGED_LABEL } from '@/config';
import { getClient } from '@api/github/getClient';

async function markUntriaged({
  id,
  payload,
  ...rest
}: EmitterWebhookEvent<'issues.opened'>) {
  const tx = Sentry.startTransaction({
    op: 'brain',
    name: 'timeToTriage.markUntriaged',
  });

  if (!REPOS_TO_TRACK.has(payload.repository?.name)) {
    return;
  }
  if ((await getOssUserType(payload)) !== 'external') {
    return;
  }

  // New issues get an Untriaged label.
  const owner = payload.repository.owner.login;
  const octokit = await getClient(owner);

  await octokit.issues.addLabels({
    owner: owner,
    repo: payload.repository.name,
    issue_number: payload.issue.number,
    labels: [UNTRIAGED_LABEL],
  });

  tx.finish();
}

function isTriaged(payload) {
  for (const label of payload.issue.labels) {
    if (label.name === UNTRIAGED_LABEL) {
      return false;
    }
  }
  return true;
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

  if (!REPOS_TO_TRACK.has(payload.repository?.name)) {
    return;
  }
  if (isFromBot(payload)) {
    return;
  }
  if (payload.label?.name === UNTRIAGED_LABEL) {
    return;
  }
  if (isTriaged(payload)) {
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

export async function timeToTriage() {
  githubEvents.removeListener('issues.opened', markUntriaged);
  githubEvents.on('issues.opened', markUntriaged);
  githubEvents.removeListener('issues.labeled', markTriaged);
  githubEvents.on('issues.labeled', markTriaged);
}

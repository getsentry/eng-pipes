import { EmitterWebhookEvent } from '@octokit/webhooks';
import * as Sentry from '@sentry/node';

import { githubEvents } from '@api/github';
import { getOssUserType } from '@utils/getOssUserType';
import { isFromABot } from '@utils/isFromABot';

const REPOS_TO_TRACK = new Set([
  'arroyo',
  'cdc',
  'craft',
  'onpremise',
  'relay',
  'responses',
  'sentry-java',
  'sentry-javascript',
  'sentry-native',
  'sentry-python',
  'snuba',
  'snuba-sdk',
  'symbolic',
  'symbolicator',
  'test-ttt-simple',
  'wal2json',
]);
import { UNTRIAGED_LABEL } from '@/config';
import { getClient } from '@api/github/getClient';

// Validation Helpers

async function shouldSkip(payload, reasonsToSkip) {
  // Could do Promise-based async here, but that was getting complicated[1] and
  // there's not really a performance concern (famous last words).
  //
  // [1] https://github.com/getsentry/eng-pipes/pull/212#discussion_r657365585

  for (const skipIf of reasonsToSkip) {
    if (await skipIf(payload)) {
      return true;
    }
  }
  return false;
}

function isAlreadyUntriaged(payload) {
  return !isAlreadyTriaged(payload);
}

function isAlreadyTriaged(payload) {
  return !payload.issue.labels.some(({ name }) => name === UNTRIAGED_LABEL);
}

async function isNotFromAnExternalUser(payload) {
  return (await getOssUserType(payload)) !== 'external';
}

function isNotInARepoWeCareAbout(payload) {
  return !REPOS_TO_TRACK.has(payload.repository.name);
}

function isTheUntriagedLabel(payload) {
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

  const reasonsToSkip = [
    isNotInARepoWeCareAbout,
    isAlreadyUntriaged,
    isNotFromAnExternalUser,
  ];
  if (await shouldSkip(payload, reasonsToSkip)) {
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

  const reasonsToSkip = [
    isNotInARepoWeCareAbout,
    isFromABot,
    isTheUntriagedLabel,
    isAlreadyTriaged,
  ];
  if (await shouldSkip(payload, reasonsToSkip)) {
    return;
  }

  // Remove Untriaged label when triaged.
  const owner = payload.repository.owner.login;
  const octokit = await getClient(owner);
  try {
    await octokit.issues.removeLabel({
      owner: owner,
      repo: payload.repository.name,
      issue_number: payload.issue.number,
      name: UNTRIAGED_LABEL,
    });
  } catch (error) {
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

// Install.

export async function timeToTriage() {
  githubEvents.removeListener('issues.opened', markUntriaged);
  githubEvents.on('issues.opened', markUntriaged);
  githubEvents.removeListener('issues.labeled', markTriaged);
  githubEvents.on('issues.labeled', markTriaged);
}

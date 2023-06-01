import { EmitterWebhookEvent } from '@octokit/webhooks';
import * as Sentry from '@sentry/node';

import {
  isNotFromAnExternalOrGTMUser,
  shouldSkip,
} from '@/utils/githubEventHelpers';
import { isFromABot } from '@utils/isFromABot';

const REPOS_TO_TRACK_FOR_TRIAGE = new Set([
  'arroyo',
  'cdc',
  'craft',
  'relay',
  'responses',
  'self-hosted',
  'sentry-native',
  'snuba',
  'snuba-sdk',
  'symbolic',
  'symbolicator',
  'test-ttt-simple',
  'wal2json',

  // Web team, T1
  'sentry-javascript',
  'sentry-python',
  'sentry-php',
  'sentry-laravel',
  'sentry-symfony',
  'sentry-ruby',

  // Mobile team, T1
  // https://www.notion.so/sentry/346452f21e7947b4bf515d5f3a4d497d?v=cad7f04cf9064e7483ab426a26d3923a
  'sentry-cocoa',
  'sentry-java',
  'sentry-react-native',
  'sentry-unity',
  'sentry-dart',
  'sentry-android-gradle-plugin',
  'sentry-dotnet',
  'sentry-dart-plugin',
]);
import { ClientType } from '@/api/github/clientType';
import { UNTRIAGED_LABEL, WAITING_FOR_PRODUCT_OWNER_LABEL } from '@/config';
import { getClient } from '@api/github/getClient';

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

  await octokit.issues.addLabels({
    owner,
    repo: payload.repository.name,
    issue_number: payload.issue.number,
    labels: [UNTRIAGED_LABEL, WAITING_FOR_PRODUCT_OWNER_LABEL],
  });

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

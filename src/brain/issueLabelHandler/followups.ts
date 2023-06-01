import { EmitterWebhookEvent } from '@octokit/webhooks';
import * as Sentry from '@sentry/node';

import { isFromABot } from '@utils/isFromABot';

const REPOS_TO_TRACK_FOR_FOLLOWUPS = new Set([
  'sentry',
  'sentry-docs',
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
  'test-sentry-app',
]);
import { ClientType } from '@/api/github/clientType';
import {
  WAITING_FOR_COMMUNITY_LABEL,
  WAITING_FOR_LABEL_PREFIX,
  WAITING_FOR_PRODUCT_OWNER_LABEL,
} from '@/config';
import {
  isNotFromAnExternalOrGTMUser,
  shouldSkip,
} from '@/utils/githubEventHelpers';
import { getClient } from '@api/github/getClient';

function isNotInARepoWeCareAboutForFollowups(payload) {
  return !REPOS_TO_TRACK_FOR_FOLLOWUPS.has(payload.repository.name);
}

function isNotWaitingForCommunity(payload) {
  const { issue } = payload;
  return !issue?.labels.some(
    ({ name }) => name === WAITING_FOR_COMMUNITY_LABEL
  );
}

// Markers of State

export async function updateCommunityFollowups({
  id,
  payload,
  ...rest
}: EmitterWebhookEvent<'issue_comment.created'>) {
  const tx = Sentry.startTransaction({
    op: 'brain',
    name: 'issueLabelHandler.updateCommunityFollowups',
  });

  const reasonsToDoNothing = [
    isNotInARepoWeCareAboutForFollowups,
    isNotFromAnExternalOrGTMUser,
    isNotWaitingForCommunity,
    isFromABot,
  ];
  if (await shouldSkip(payload, reasonsToDoNothing)) {
    return;
  }

  const owner = payload.repository.owner.login;
  const octokit = await getClient(ClientType.App, owner);

  await octokit.issues.removeLabel({
    owner,
    repo: payload.repository.name,
    issue_number: payload.issue.number,
    name: WAITING_FOR_COMMUNITY_LABEL,
  });

  await octokit.issues.addLabels({
    owner,
    repo: payload.repository.name,
    issue_number: payload.issue.number,
    labels: [WAITING_FOR_PRODUCT_OWNER_LABEL],
  });

  tx.finish();
}

export async function ensureOneWaitingForLabel({
  id,
  payload,
  ...rest
}: EmitterWebhookEvent<'issues.labeled'>) {
  const tx = Sentry.startTransaction({
    op: 'brain',
    name: 'issueLabelHandler.ensureOneWaitingForLabel',
  });

  const reasonsToDoNothing = [isFromABot];
  if (await shouldSkip(payload, reasonsToDoNothing)) {
    return;
  }

  const { issue, label } = payload;
  const owner = payload.repository.owner.login;
  const octokit = await getClient(ClientType.App, owner);

  if (label?.name.startsWith(WAITING_FOR_LABEL_PREFIX)) {
    const labelToRemove =
      issue.labels?.find(
        ({ name }) =>
          name.startsWith(WAITING_FOR_LABEL_PREFIX) && name != label?.name
      )?.name || '';
    await octokit.issues.removeLabel({
      owner: owner,
      repo: payload.repository.name,
      issue_number: payload.issue.number,
      name: labelToRemove,
    });
  }

  tx.finish();
}

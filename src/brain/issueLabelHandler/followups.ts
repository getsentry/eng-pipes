import { EmitterWebhookEvent } from '@octokit/webhooks';
import * as Sentry from '@sentry/node';

import { isFromABot } from '@utils/isFromABot';

import { ClientType } from '@/api/github/clientType';
import {
  SENTRY_MONOREPOS,
  SENTRY_REPOS,
  WAITING_FOR_COMMUNITY_LABEL,
  WAITING_FOR_LABEL_PREFIX,
  WAITING_FOR_PRODUCT_OWNER_LABEL,
  STATUS_FIELD_ID,
} from '@/config';
import {
  isNotFromAnExternalOrGTMUser,
  shouldSkip,
  modifyProjectIssueField,
  addIssueToGlobalIssuesProject,
} from '@/utils/githubEventHelpers';
import { getClient } from '@api/github/getClient';

const REPOS_TO_TRACK_FOR_FOLLOWUPS = new Set([...SENTRY_REPOS, ...SENTRY_MONOREPOS]);

function isNotInARepoWeCareAboutForFollowups(payload) {
  return !REPOS_TO_TRACK_FOR_FOLLOWUPS.has(payload.repository.name);
}

function isNotWaitingForLabel(payload) {
  return !payload.label?.name.startsWith(WAITING_FOR_LABEL_PREFIX);
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
  const repo = payload.repository.name;
  const issueNumber = payload.issue.number;

  const isWaitingForCommunityLabelOnIssue =
      payload.issue.labels?.find(
        ({ name }) =>
          name === WAITING_FOR_COMMUNITY_LABEL
      )?.name

  if(isWaitingForCommunityLabelOnIssue) {
    await octokit.issues.removeLabel({
      owner,
      repo: repo,
      issue_number: issueNumber,
      name: WAITING_FOR_COMMUNITY_LABEL,
    });
  }

  await octokit.issues.addLabels({
    owner,
    repo: repo,
    issue_number: issueNumber,
    labels: [WAITING_FOR_PRODUCT_OWNER_LABEL],
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

export async function ensureOneWaitingForLabel({
  id,
  payload,
  ...rest
}: EmitterWebhookEvent<'issues.labeled'>) {
  const tx = Sentry.startTransaction({
    op: 'brain',
    name: 'issueLabelHandler.ensureOneWaitingForLabel',
  });

  const reasonsToDoNothing = [ isNotInARepoWeCareAboutForFollowups, isNotWaitingForLabel ];
  if (await shouldSkip(payload, reasonsToDoNothing)) {
    return;
  }

  const { issue, label } = payload;
  const owner = payload.repository.owner.login;
  const octokit = await getClient(ClientType.App, owner);
  const repo = payload.repository.name;
  const issueNumber = payload.issue.number;
  // Here label will never be undefined, ts is erroring here but is handled in the shouldSkip above
  // @ts-ignore
  const labelName = label.name;

  const labelToRemove =
    issue.labels?.find(
      ({ name }) =>
        name.startsWith(WAITING_FOR_LABEL_PREFIX) && name != labelName
    )?.name;

  if (labelToRemove != null) {
    await octokit.issues.removeLabel({
      owner: owner,
      repo: repo,
      issue_number: issueNumber,
      name: labelToRemove,
    });
  }

  const itemId: string = await addIssueToGlobalIssuesProject(payload.issue.node_id, repo, issueNumber, octokit);

  await modifyProjectIssueField(
    itemId,
    labelName,
    STATUS_FIELD_ID,
    octokit
  );

  tx.finish();
}

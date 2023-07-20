import { EmitterWebhookEvent } from '@octokit/webhooks';
import * as Sentry from '@sentry/node';
import moment from 'moment-timezone';

import {
  GH_APPS,
  SENTRY_REPOS,
  WAITING_FOR_COMMUNITY_LABEL,
  WAITING_FOR_LABEL_PREFIX,
  WAITING_FOR_PRODUCT_OWNER_LABEL,
  WAITING_FOR_SUPPORT_LABEL,
} from '@/config';
import { ClientType } from '@api/github/clientType';
import { getClient } from '@api/github/getClient';
import {
  calculateSLOViolationRoute,
  calculateSLOViolationTriage,
} from '@utils/businessHours';
import {
  addIssueToGlobalIssuesProject,
  isNotFromAnExternalOrGTMUser,
  modifyDueByDate,
  modifyProjectIssueField,
  shouldSkip,
} from '@utils/githubEventHelpers';
import { isFromABot } from '@utils/isFromABot';

function isNotInARepoWeCareAboutForFollowups(payload) {
  return !SENTRY_REPOS.has(payload.repository.name);
}

function isNotWaitingForLabel(payload) {
  return !payload.label?.name.startsWith(WAITING_FOR_LABEL_PREFIX);
}

function isContractor(payload) {
  // Contractors are outside collaborators on GitHub
  return payload.comment.author_association === 'COLLABORATOR';
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

  const app = GH_APPS.getForPayload(payload);

  const reasonsToDoNothing = [
    isNotInARepoWeCareAboutForFollowups,
    isNotFromAnExternalOrGTMUser,
    isContractor,
    isNotWaitingForCommunity,
    isFromABot,
  ];

  if (await shouldSkip(payload, app, reasonsToDoNothing)) {
    return;
  }

  const owner = payload.repository.owner.login;
  const octokit = await getClient(ClientType.App, owner);
  const repo = payload.repository.name;
  const issueNumber = payload.issue.number;

  const isWaitingForCommunityLabelOnIssue = payload.issue.labels?.find(
    ({ name }) => name === WAITING_FOR_COMMUNITY_LABEL
  )?.name;

  if (isWaitingForCommunityLabelOnIssue) {
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

export async function ensureOneWaitingForLabel({
  id,
  payload,
  ...rest
}: EmitterWebhookEvent<'issues.labeled'>) {
  const tx = Sentry.startTransaction({
    op: 'brain',
    name: 'issueLabelHandler.ensureOneWaitingForLabel',
  });

  const app = GH_APPS.getForPayload(payload);

  const reasonsToDoNothing = [
    isNotInARepoWeCareAboutForFollowups,
    isNotWaitingForLabel,
  ];
  if (await shouldSkip(payload, app, reasonsToDoNothing)) {
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

  const labelToRemove = issue.labels?.find(
    ({ name }) => name.startsWith(WAITING_FOR_LABEL_PREFIX) && name != labelName
  )?.name;

  if (labelToRemove != null) {
    await octokit.issues.removeLabel({
      owner: owner,
      repo: repo,
      issue_number: issueNumber,
      name: labelToRemove,
    });
  }

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
    labelName,
    app.project.status_field_id,
    octokit
  );

  let timeToRespondBy;
  if (labelName === WAITING_FOR_PRODUCT_OWNER_LABEL) {
    timeToRespondBy =
      (await calculateSLOViolationTriage(
        WAITING_FOR_PRODUCT_OWNER_LABEL,
        issue.labels
      )) || moment().toISOString();
  } else if (labelName === WAITING_FOR_SUPPORT_LABEL) {
    timeToRespondBy =
      (await calculateSLOViolationRoute(WAITING_FOR_SUPPORT_LABEL)) ||
      moment().toISOString();
  } else {
    timeToRespondBy = '';
  }

  await modifyDueByDate(
    app,
    itemId,
    timeToRespondBy,
    app.project.response_due_date_field_id,
    octokit
  );

  tx.finish();
}

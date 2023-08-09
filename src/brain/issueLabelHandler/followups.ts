import { EmitterWebhookEvent } from '@octokit/webhooks';
import * as Sentry from '@sentry/node';
import moment from 'moment-timezone';

import {
  GH_ORGS,
  WAITING_FOR_COMMUNITY_LABEL,
  WAITING_FOR_LABEL_PREFIX,
  WAITING_FOR_PRODUCT_OWNER_LABEL,
  WAITING_FOR_SUPPORT_LABEL,
} from '@/config';
import {
  calculateSLOViolationRoute,
  calculateSLOViolationTriage,
} from '@utils/businessHours';
import { isFromABot } from '@utils/isFromABot';
import { isNotFromAnExternalOrGTMUser } from '@utils/isNotFromAnExternalOrGTMUser';
import { shouldSkip } from '@utils/shouldSkip';

function isNotInARepoWeCareAboutForFollowups(payload, org) {
  return !org.repos.all.includes(payload.repository.name);
}

function isNotWaitingForLabel(payload) {
  return !payload.label?.name.startsWith(WAITING_FOR_LABEL_PREFIX);
}

function isWaitingForSupport(payload) {
  return payload.issue.labels.some(
    ({ name }) => name === WAITING_FOR_SUPPORT_LABEL
  );
}

function isCommentFromCollaborator(payload) {
  // Contractors are outside collaborators on GitHub
  return payload.comment.author_association === 'COLLABORATOR';
}

function isPullRequest(payload) {
  return !!payload.issue.pull_request;
}

function isIssueClosed(payload) {
  return payload.issue.state === 'closed';
}

// Markers of State

export async function updateFollowupsOnComment({
  id,
  payload,
  ...rest
}: EmitterWebhookEvent<'issue_comment.created'>) {
  const tx = Sentry.startTransaction({
    op: 'brain',
    name: 'issueLabelHandler.updateFollowupsOnComment',
  });

  const org = GH_ORGS.getForPayload(payload);

  const reasonsToDoNothing = [
    isNotInARepoWeCareAboutForFollowups,
    isWaitingForSupport,
    isPullRequest,
    isFromABot,
    isIssueClosed,
  ];

  if (await shouldSkip(payload, org, reasonsToDoNothing)) {
    return;
  }

  const repo = payload.repository.name;
  const issueNumber = payload.issue.number;

  const isLabelOnIssue = (labelName) =>
    payload.issue.labels?.find(({ name }) => name === labelName)?.name;

  if (
    (await isNotFromAnExternalOrGTMUser(payload)) ||
    isCommentFromCollaborator(payload)
  ) {
    const isWaitingForProductOwnerLabelOnIssue = isLabelOnIssue(
      WAITING_FOR_PRODUCT_OWNER_LABEL
    );

    if (isWaitingForProductOwnerLabelOnIssue) {
      await org.api.issues.removeLabel({
        owner: org.slug,
        repo: repo,
        issue_number: issueNumber,
        name: WAITING_FOR_PRODUCT_OWNER_LABEL,
      });
      const itemId: string = await org.addIssueToGlobalIssuesProject(
        payload.issue.node_id,
        repo,
        issueNumber
      );

      await org.clearProjectIssueField(itemId, org.project.fieldIds.status);
    }
  } else {
    const isWaitingForCommunityLabelOnIssue = isLabelOnIssue(
      WAITING_FOR_COMMUNITY_LABEL
    );

    if (isWaitingForCommunityLabelOnIssue) {
      await org.api.issues.removeLabel({
        owner: org.slug,
        repo: repo,
        issue_number: issueNumber,
        name: WAITING_FOR_COMMUNITY_LABEL,
      });
    }

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
  }

  tx.finish();
}

export async function clearWaitingForProductOwnerStatus({
  id,
  payload,
  ...rest
}: EmitterWebhookEvent<'issues.unlabeled'>) {
  const tx = Sentry.startTransaction({
    op: 'brain',
    name: 'issueLabelHandler.clearWaitingForProductOwnerStatus',
  });

  const org = GH_ORGS.getForPayload(payload);

  const reasonsToDoNothing = [
    isNotInARepoWeCareAboutForFollowups,
    isNotWaitingForLabel,
    isFromABot,
  ];
  if (await shouldSkip(payload, org, reasonsToDoNothing)) {
    return;
  }

  const { label } = payload;
  const repo = payload.repository.name;
  const issueNumber = payload.issue.number;
  if (label?.name == null) {
    Sentry.captureException(
      `Webhook label name is undefined for ${repo}/${issueNumber}`
    );
    return;
  }

  const itemId: string = await org.addIssueToGlobalIssuesProject(
    payload.issue.node_id,
    repo,
    issueNumber
  );

  await org.clearProjectIssueField(itemId, org.project.fieldIds.status);

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

  const org = GH_ORGS.getForPayload(payload);

  const reasonsToDoNothing = [
    isNotInARepoWeCareAboutForFollowups,
    isNotWaitingForLabel,
  ];
  if (await shouldSkip(payload, org, reasonsToDoNothing)) {
    return;
  }

  const { issue, label } = payload;
  const repo = payload.repository.name;
  const issueNumber = payload.issue.number;
  if (label?.name == null) {
    Sentry.captureException(
      `Webhook label name is undefined for ${repo}/${issueNumber}`
    );
    return;
  }
  const labelName = label.name;

  const labelToRemove = issue.labels?.find(
    ({ name }) => name.startsWith(WAITING_FOR_LABEL_PREFIX) && name != labelName
  )?.name;

  if (labelToRemove != null) {
    await org.api.issues.removeLabel({
      owner: org.slug,
      repo: repo,
      issue_number: issueNumber,
      name: labelToRemove,
    });
  }

  const itemId: string = await org.addIssueToGlobalIssuesProject(
    payload.issue.node_id,
    repo,
    issueNumber
  );

  await org.modifyProjectIssueField(
    itemId,
    labelName,
    org.project.fieldIds.status
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

  await org.modifyDueByDate(
    itemId,
    timeToRespondBy,
    org.project.fieldIds.responseDue
  );

  tx.finish();
}

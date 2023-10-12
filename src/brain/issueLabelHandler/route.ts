import '@sentry/tracing';

import { EmitterWebhookEvent } from '@octokit/webhooks';
import * as Sentry from '@sentry/node';

import {
  GH_ORGS,
  PRODUCT_AREA_LABEL_PREFIX,
  PRODUCT_AREA_UNKNOWN,
  WAITING_FOR_PRODUCT_OWNER_LABEL,
  WAITING_FOR_SUPPORT_LABEL,
} from '~/src/config';
import { isFromOutsideCollaborator } from '~/src/utils/isFromOutsideCollaborator';
import { isNotFromAnExternalOrGTMUser } from '~/src/utils/isNotFromAnExternalOrGTMUser';
import { shouldSkip } from '~/src/utils/shouldSkip';
import { slugizeProductArea } from '~/src/utils/slugizeProductArea';

function isAlreadyWaitingForSupport(payload) {
  return payload.issue.labels.some(
    ({ name }) => name === WAITING_FOR_SUPPORT_LABEL
  );
}

function isNotInARepoWeCareAboutForRouting(payload, org) {
  return !org.repos.withRouting.includes(payload.repository.name);
}

function isValidLabel(payload) {
  return (
    !payload.label?.name.startsWith(PRODUCT_AREA_LABEL_PREFIX) ||
    payload.issue.state !== 'open'
  );
}

function shouldLabelBeRemoved(labelName, target_name) {
  return (
    (labelName.startsWith(PRODUCT_AREA_LABEL_PREFIX) &&
      labelName !== target_name) ||
    labelName === WAITING_FOR_SUPPORT_LABEL
  );
}

// Markers of State

export async function markWaitingForSupport({
  payload,
}: EmitterWebhookEvent<'issues.opened'>) {
  const tx = Sentry.startTransaction({
    op: 'brain',
    name: 'issueLabelHandler.markWaitingForSupport',
  });

  const org = GH_ORGS.getForPayload(payload);

  const reasonsToSkip = [
    isNotInARepoWeCareAboutForRouting,
    isAlreadyWaitingForSupport,
    isNotFromAnExternalOrGTMUser,
    isFromOutsideCollaborator,
  ];
  if (await shouldSkip(payload, org, reasonsToSkip)) {
    return;
  }

  const repo = payload.repository.name;
  const issueNumber = payload.issue.number;

  // New issues get a Waiting for: Support label.
  await org.api.issues.addLabels({
    owner: org.slug,
    repo: repo,
    issue_number: issueNumber,
    labels: [WAITING_FOR_SUPPORT_LABEL],
  });

  await org.api.issues.createComment({
    owner: org.slug,
    repo: repo,
    issue_number: issueNumber,
    body: `Assigning to @${org.slug}/support for [routing](https://open.sentry.io/triage/#2-route) ⏲️`,
  });

  tx.finish();
}

async function routeIssue(org, productAreaLabelName) {
  try {
    const productArea = productAreaLabelName?.substr(
      PRODUCT_AREA_LABEL_PREFIX.length
    );
    const ghTeamSlug = 'product-owners-' + slugizeProductArea(productArea);
    await org.api.teams.getByName({
      org: org.slug,
      team_slug: ghTeamSlug,
    }); // expected to throw if team doesn't exist
    return `Routing to @${org.slug}/${ghTeamSlug} for [triage](https://develop.sentry.dev/processing-tickets/#3-triage) ⏲️`;
  } catch (error) {
    Sentry.captureException(error);
    return `Failed to route for ${productAreaLabelName}. Defaulting to @${org.slug}/open-source for [triage](https://develop.sentry.dev/processing-tickets/#3-triage) ⏲️`;
  }
}

export async function markNotWaitingForSupport({
  payload,
}: EmitterWebhookEvent<'issues.labeled'>) {
  const tx = Sentry.startTransaction({
    op: 'brain',
    name: 'issueLabelHandler.markNotWaitingForSupport',
  });

  const org = GH_ORGS.getForPayload(payload);

  const reasonsToSkip = [isNotInARepoWeCareAboutForRouting, isValidLabel];
  if (await shouldSkip(payload, org, reasonsToSkip)) {
    return;
  }

  const { issue, label } = payload;
  const productAreaLabel = label;
  const productAreaLabelName = productAreaLabel?.name || PRODUCT_AREA_UNKNOWN;
  const labelsToRemove: string[] = [];
  const labelNames = issue?.labels?.map((label) => label.name) || [];
  const isBeingRoutedBySupport = labelNames.includes(WAITING_FOR_SUPPORT_LABEL);

  // When routing, remove all Product Area labels that currently exist on issue
  labelNames.forEach((labelName) => {
    if (shouldLabelBeRemoved(labelName, productAreaLabelName)) {
      labelsToRemove.push(labelName);
    }
  });

  for (const label of labelsToRemove) {
    try {
      await org.api.issues.removeLabel({
        owner: org.slug,
        repo: payload.repository.name,
        issue_number: payload.issue.number,
        name: label,
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
  }

  // Only retriage issues if support is routing
  if (isBeingRoutedBySupport) {
    await org.api.issues.addLabels({
      owner: org.slug,
      repo: payload.repository.name,
      issue_number: payload.issue.number,
      labels: [WAITING_FOR_PRODUCT_OWNER_LABEL],
    });
  }

  const comment = await routeIssue(org, productAreaLabelName);

  await org.api.issues.createComment({
    owner: org.slug,
    repo: payload.repository.name,
    issue_number: payload.issue.number,
    body: comment,
  });

  /**
   * We'll try adding the issue to our global issues project. If it already exists, the existing ID will be returned
   * https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects#adding-an-item-to-a-project
   */
  const itemId: string = await org.addIssueToGlobalIssuesProject(
    payload.issue.node_id,
    payload.repository.name,
    payload.issue.number
  );
  const productArea = productAreaLabelName?.substr(
    PRODUCT_AREA_LABEL_PREFIX.length
  );
  await org.modifyProjectIssueField(
    itemId,
    productArea,
    org.project.fieldIds.productArea
  );

  tx.finish();
}

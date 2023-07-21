import { EmitterWebhookEvent } from '@octokit/webhooks';
import * as Sentry from '@sentry/node';

import {
  BACKLOG_LABEL,
  GETSENTRY_ORG,
  GH_ORGS,
  IN_PROGRESS_LABEL,
  PRODUCT_AREA_LABEL_PREFIX,
  PRODUCT_AREA_UNKNOWN,
  SENTRY_REPOS_WITH_ROUTING,
  WAITING_FOR_PRODUCT_OWNER_LABEL,
  WAITING_FOR_SUPPORT_LABEL,
} from '@/config';
import { ClientType } from '@api/github/clientType';
import { getClient } from '@api/github/getClient';
import {
  addIssueToGlobalIssuesProject,
  isNotFromAnExternalOrGTMUser,
  modifyProjectIssueField,
  shouldSkip,
} from '@utils/githubEventHelpers';
import { slugizeProductArea } from '@utils/slugizeProductArea';

function isAlreadyWaitingForSupport(payload) {
  return payload.issue.labels.some(
    ({ name }) => name === WAITING_FOR_SUPPORT_LABEL
  );
}

function isNotInARepoWeCareAboutForRouting(payload) {
  return !SENTRY_REPOS_WITH_ROUTING.has(payload.repository.name);
}

function isValidLabel(payload) {
  return (
    !payload.label?.name.startsWith(PRODUCT_AREA_LABEL_PREFIX) ||
    payload.issue.labels?.some(
      (label) =>
        label.name === BACKLOG_LABEL || label.name === IN_PROGRESS_LABEL
    ) ||
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
  id,
  payload,
  ...rest
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
  ];
  if (await shouldSkip(payload, org, reasonsToSkip)) {
    return;
  }

  const repo = payload.repository.name;
  const issueNumber = payload.issue.number;

  // New issues get a Waiting for: Support label.
  const owner = payload.repository.owner.login;
  const octokit = await getClient(ClientType.App, owner);
  await octokit.issues.addLabels({
    owner,
    repo: repo,
    issue_number: issueNumber,
    labels: [WAITING_FOR_SUPPORT_LABEL],
  });

  await octokit.issues.createComment({
    owner,
    repo: repo,
    issue_number: issueNumber,
    body: `Assigning to @${GETSENTRY_ORG}/support for [routing](https://open.sentry.io/triage/#2-route) ⏲️`,
  });

  tx.finish();
}

async function routeIssue(octokit, productAreaLabelName) {
  try {
    const productArea = productAreaLabelName?.substr(
      PRODUCT_AREA_LABEL_PREFIX.length
    );
    const ghTeamSlug = 'product-owners-' + slugizeProductArea(productArea);
    await octokit.teams.getByName({
      org: GETSENTRY_ORG,
      team_slug: ghTeamSlug,
    }); // expected to throw if team doesn't exist
    return `Routing to @${GETSENTRY_ORG}/${ghTeamSlug} for [triage](https://develop.sentry.dev/processing-tickets/#3-triage) ⏲️`;
  } catch (error) {
    Sentry.captureException(error);
    return `Failed to route for ${productAreaLabelName}. Defaulting to @${GETSENTRY_ORG}/open-source for [triage](https://develop.sentry.dev/processing-tickets/#3-triage) ⏲️`;
  }
}

export async function markNotWaitingForSupport({
  id,
  payload,
  ...rest
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
  const owner = payload.repository.owner.login;
  const octokit = await getClient(ClientType.App, owner);
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
      await octokit.issues.removeLabel({
        owner: owner,
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
    await octokit.issues.addLabels({
      owner: owner,
      repo: payload.repository.name,
      issue_number: payload.issue.number,
      labels: [WAITING_FOR_PRODUCT_OWNER_LABEL],
    });
  }

  const comment = await routeIssue(octokit, productAreaLabelName);

  await octokit.issues.createComment({
    owner,
    repo: payload.repository.name,
    issue_number: payload.issue.number,
    body: comment,
  });

  /**
   * We'll try adding the issue to our global issues project. If it already exists, the existing ID will be returned
   * https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects#adding-an-item-to-a-project
   */
  const itemId: string = await addIssueToGlobalIssuesProject(
    org,
    payload.issue.node_id,
    payload.repository.name,
    payload.issue.number,
    octokit
  );
  const productArea = productAreaLabelName?.substr(
    PRODUCT_AREA_LABEL_PREFIX.length
  );
  await modifyProjectIssueField(
    org,
    itemId,
    productArea,
    org.project.product_area_field_id,
    octokit
  );

  tx.finish();
}

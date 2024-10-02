import '@sentry/tracing';

import { EmitterWebhookEvent } from '@octokit/webhooks';
import * as Sentry from '@sentry/node';
import { GoogleAuth } from 'google-auth-library';

import { GitHubOrg } from '@/api/github/org';
import {
  GH_ORGS,
  PREDICT_ENDPOINT,
  PRODUCT_AREA_LABEL_PREFIX,
  PRODUCT_AREA_UNKNOWN,
  WAITING_FOR_PRODUCT_OWNER_LABEL,
  WAITING_FOR_SUPPORT_LABEL,
} from '@/config';
import { isFromABot } from '@/utils/github/isFromABot';
import { isFromOutsideCollaborator } from '@/utils/isFromOutsideCollaborator';
import { db } from '@utils/db';
import { isNotFromAnExternalOrGTMUser } from '@utils/isNotFromAnExternalOrGTMUser';
import { shouldSkip } from '@utils/shouldSkip';
import { slugizeProductArea } from '@utils/slugizeProductArea';

type PredictionInfo = {
  comment: string;
  predictedProductArea: string;
  predictedLabel: string;
};

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

async function makePredictions(
  org: GitHubOrg,
  issueText: string,
  repo: string,
  issueNumber: number
): Promise<PredictionInfo> {
  const auth = new GoogleAuth();
  const client = await auth.getIdTokenClient(PREDICT_ENDPOINT);
  let comment = `Assigning to @${org.slug}/support for [routing](https://open.sentry.io/triage/#2-route) ⏲️`;
  let predictedLabel, predictedProductArea;

  try {
    const inferenceResponse = await client.request({
      url: PREDICT_ENDPOINT,
      method: 'POST',
      data: { text: issueText },
    });
    // @ts-ignore Response is of type unknown since it comes from inference service
    const inferenceJSON: any = inferenceResponse?.data;
    predictedLabel = inferenceJSON.predicted_label;
    const probability = inferenceJSON.probability;
    // Only auto-route if probability is 0.7 or over
    if (probability >= 0.9) {
      await org.api.issues.addLabels({
        owner: org.slug,
        repo: repo,
        issue_number: issueNumber,
        labels: [predictedLabel],
      });
      predictedProductArea = predictedLabel?.substr(
        PRODUCT_AREA_LABEL_PREFIX.length
      );
      const ghTeamSlug =
        'product-owners-' + slugizeProductArea(predictedProductArea);
      comment = `Auto-routing to @${org.slug}/${ghTeamSlug} for [triage](https://develop.sentry.dev/processing-tickets/#3-triage) ⏲️`;
    } else {
      predictedLabel = null;
      predictedProductArea = null;
    }
  } catch (err) {
    Sentry.captureException(err);
    predictedLabel = null;
    predictedProductArea = null;
  }
  return {
    comment,
    predictedProductArea,
    predictedLabel,
  };
}

// Markers of State

export async function handleNewIssues({
  payload,
}: EmitterWebhookEvent<'issues.opened'>) {
  const tx = Sentry.startTransaction({
    op: 'brain',
    name: 'issueLabelHandler.handleNewIssues',
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

  const issueData = (
    await org.api.issues.get({
      owner: org.slug,
      repo: repo,
      issue_number: issueNumber,
    })
  )?.data;

  const issueText = issueData?.title + ' ' + issueData?.body;
  const { predictedLabel, predictedProductArea, comment } =
    await makePredictions(org, issueText, repo, issueNumber);

  const response = await org.api.issues.createComment({
    owner: org.slug,
    repo: repo,
    issue_number: issueNumber,
    body: comment,
  });

  // Store all auto routed comments in db for now, so we can figure out how many issues have been successfully routed.
  // We can do this by comparing the suggested product area label with the final product area of an issue.
  if (predictedLabel && predictedProductArea) {
    await db('auto_routed_comments').insert({
      owner: org.slug,
      repo: repo,
      url: response?.data.url,
      product_area: predictedLabel,
    });
    // New auto routed issues get a Waiting for: Product Owner label.
    await org.api.issues.addLabels({
      owner: org.slug,
      repo: repo,
      issue_number: issueNumber,
      labels: [WAITING_FOR_PRODUCT_OWNER_LABEL],
    });
  } else {
    // New unrouted issues get a Waiting for: Support label.
    await org.api.issues.addLabels({
      owner: org.slug,
      repo: repo,
      issue_number: issueNumber,
      labels: [WAITING_FOR_SUPPORT_LABEL],
    });
  }

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

  if (!isFromABot(payload)) {
    const comment = await routeIssue(org, productAreaLabelName);

    await org.api.issues.createComment({
      owner: org.slug,
      repo: payload.repository.name,
      issue_number: payload.issue.number,
      body: comment,
    });
  }

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

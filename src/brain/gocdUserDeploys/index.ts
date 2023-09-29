import { getUser } from '@/api/getUser';
import { gocdevents } from '@/api/gocdevents';
import { slackMessageUser } from '@/api/slackMessageUser';
import {
  GETSENTRY_ORG,
  GETSENTRY_REPO_SLUG,
  GOCD_ORIGIN,
  GOCD_SENTRYIO_BE_PIPELINE_GROUP,
  GOCD_SENTRYIO_FE_PIPELINE_GROUP,
  SENTRY_REPO_SLUG,
} from '@/config';
import { GoCDResponse, GoCDStageData } from '@/types';
import { getCommitterSlackUsers } from '@/api/github/getAuthors';
import { getBaseAndHeadCommit } from '@/utils/gocdHelpers';
import { getRelevantCommit } from '@/api/github/getRelevantCommit';
import { getChangedStack } from '@/api/github/getChangedStack';
import * as slackblocks from '@/blocks/slackBlocks';
import {
  KnownBlock,
} from '@slack/types';

const PIPELINE_GROUP_FILTER = [
  GOCD_SENTRYIO_FE_PIPELINE_GROUP,
  GOCD_SENTRYIO_BE_PIPELINE_GROUP,
];
const DEBUG = true;

async function handler(resBody: GoCDResponse) {
  const { pipeline } = resBody.data as GoCDStageData;

  // Only notify on the getsentry frontend / backend
  // pipelines.
  if (!PIPELINE_GROUP_FILTER.includes(pipeline.group)) {
    return;
  }

  // We don't care about checks passing or failing, wait until the
  // checks have passed and we actually start a deploy
  if (pipeline.stage.name.toLowerCase() === 'checks') {
    return;
  }

  const user = await getUser({email: 'matt.gaunt@sentry.io'});
  if (!user) {
    return;
  }

  const [base, head] = await getBaseAndHeadCommit(pipeline);
  if (!head) return;

  const relevantCommit = await getRelevantCommit(head);
  let commitLink = `https://github.com/${GETSENTRY_ORG.slug}/${GETSENTRY_REPO_SLUG}/commits/${head}`;
  let commitLinkText = `${head.slice(0, 7)}`;
  let commitTitle: string = '';
  let commitUrl = commitLink;
  let isFullstackChange = true;
  if (relevantCommit) {
    // Try and reduce noise to engineers by only messaging them about backend
    // deploys for backend changes and vice versa for frontend.
    const relevantCommitRepo =
    relevantCommit.sha === head
      ? GETSENTRY_REPO_SLUG
      : SENTRY_REPO_SLUG;

    commitLink = `https://github.com/${GETSENTRY_ORG.slug}/${relevantCommitRepo}/commit/${relevantCommit.sha}`;
    commitLinkText = `${relevantCommit.sha.slice(0, 7)}`;

    const [title] = relevantCommit.commit.message.split('\n');
    commitTitle = title;

    const { isFrontendOnly, isBackendOnly, isFullstack } = await getChangedStack(
      relevantCommit.sha,
      relevantCommitRepo
    );
    isFullstackChange = isFullstack === undefined ? isFullstackChange : isFullstack;

    // Check if the pipeline is frontend
    if (isFrontendOnly && pipeline.group !== GOCD_SENTRYIO_FE_PIPELINE_GROUP) {
      console.warn(`Skipping ${pipeline.group} deploy for frontend change`);
      return;
    }
    // Check if the pipeline is backend
    if (isBackendOnly && pipeline.group !== GOCD_SENTRYIO_BE_PIPELINE_GROUP) {
      console.warn(`Skipping ${pipeline.group} deploy for backend change`);
      return;
    }
  } else {
    console.warn(`No relevant commit found, so posting to users regardless`);
  }

  const users = await getCommitterSlackUsers(GETSENTRY_REPO_SLUG, base, head);
  if (users.length === 0 && !DEBUG) {
    return;
  }

  const pipedreamBlocks: Array<KnownBlock> = [];
  const links: Array<string> = [];
  if (isFullstackChange || pipeline.group === GOCD_SENTRYIO_FE_PIPELINE_GROUP) {
    pipedreamBlocks.push(
      slackblocks.section(slackblocks.markdown('*Frontend*')),
    );
    const link = `${GOCD_ORIGIN}/go/pipelines/value_stream_map/${pipeline.name}/${pipeline.counter}`;
    links.push(`👀 <${link}|Deploy on GoCD>`)
    links.push(`📊 <https://deploy-tools.getsentry.net/services/${pipeline.group}|Frontend deploy on deploy-tools>`);
  }
  if (isFullstackChange || pipeline.group === GOCD_SENTRYIO_BE_PIPELINE_GROUP) {
    pipedreamBlocks.push(
      slackblocks.section(slackblocks.markdown('*Backend*')),
    );
    const link = `${GOCD_ORIGIN}/go/pipelines/value_stream_map/${pipeline.name}/${pipeline.counter}`;
    links.push(`👀 <${link}|Deploy on GoCD>`)
    links.push(`📊 <https://deploy-tools.getsentry.net/services/${pipeline.group}|Backend deploy on deploy-tools>`);
  }

  console.log(`Users: ${JSON.stringify(users)}`);
  await slackMessageUser(user.slackUser, {
    text: `Hello Matt, we found ${users.length} committers to message`,
    blocks: [
      slackblocks.section(
        slackblocks.markdown(`Your commit getsentry@<${commitLink}|${commitLinkText}> is being deployed`),
      ),
      slackblocks.context(slackblocks.markdown(`Commit: <${commitUrl}|${commitTitle}>`)),
      slackblocks.divider(),
      ...pipedreamBlocks,
      slackblocks.divider(),
      slackblocks.context(
        slackblocks.markdown(`*Links*\n${links.join('\n')}`),
      ),
    ],
    unfurl_links: false,
  });
  return;
}

export async function gocdUserDeploys() {
  gocdevents.on('stage', handler);
}

/**

{
	"blocks": [
		{
			"type": "section",
			"text": {
				"type": "mrkdwn",
				"text": "Your commit getsentry@75489 is being deployed"
			}
		},
		{
			"type": "context",
			"elements": [
				{
					"type": "mrkdwn",
					"text": "Commit: <https://github.com|chore(tests): Add requires kafka to tests/snuba/incidents/ (#56629)>"
				}
			]
		},
		{
			"type": "divider"
		},
		{
			"type": "section",
			"text": {
				"type": "mrkdwn",
				"text": "*Frontend*"
			}
		},
		{
			"type": "context",
			"elements": [
				{
					"type": "mrkdwn",
					"text": "✅ <https://deploy.getsentry.net|s4s>"
				},
				{
					"type": "mrkdwn",
					"text": "⏳ <https://deploy.getsentry.net|US> (<https://deploy.getsentry.net|_deploy-canary_>)"
				},
				{
					"type": "mrkdwn",
					"text": "  Customer 1"
				},
				{
					"type": "mrkdwn",
					"text": "  Customer 2"
				},
				{
					"type": "mrkdwn",
					"text": "  Customer 3"
				},
				{
					"type": "mrkdwn",
					"text": "  Customer 4"
				}
			]
		},
		{
			"type": "section",
			"text": {
				"type": "mrkdwn",
				"text": "*Backend*"
			}
		},
		{
			"type": "context",
			"elements": [
				{
					"type": "mrkdwn",
					"text": "✅ <https://deploy.getsentry.net|s4s>"
				},
				{
					"type": "mrkdwn",
					"text": "✅ <https://deploy.getsentry.net|US>"
				},
				{
					"type": "mrkdwn",
					"text": "✅ <https://deploy.getsentry.net|Customer 1>"
				},
				{
					"type": "mrkdwn",
					"text": "❌ <https://deploy.getsentry.net|Customer 2> (<https://deploy.getsentry.net|_deploy-primary>)"
				},
				{
					"type": "mrkdwn",
					"text": "Customer 3"
				},
				{
					"type": "mrkdwn",
					"text": "Customer 4"
				}
			]
		},
		{
			"type": "divider"
		},
		{
			"type": "section",
			"text": {
				"type": "mrkdwn",
				"text": "*Links*"
			}
		},
		{
			"type": "section",
			"text": {
				"type": "mrkdwn",
				"text": "👀 <http://github.com|Deploy on GoCD>"
			}
		},
		{
			"type": "section",
			"text": {
				"type": "mrkdwn",
				"text": "📊 <http://github.com|Deploy on deploy-tools>"
			}
		}
	]
}

 */

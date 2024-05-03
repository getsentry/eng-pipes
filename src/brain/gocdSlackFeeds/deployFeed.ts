import '@sentry/tracing';

import * as Sentry from '@sentry/node';
import {
  Block,
  KnownBlock,
  MessageAttachment,
  MrkdwnElement,
} from '@slack/types';

import { getUser } from '@/api/getUser';
import { bolt } from '@/api/slack';
import * as slackblocks from '@/blocks/slackBlocks';
import {
  GETSENTRY_REPO_SLUG,
  GH_ORGS,
  GOCD_ORIGIN,
  SENTRY_REPO_SLUG,
} from '@/config';
import { SlackMessage } from '@/config/slackMessage';
import { GoCDModification, GoCDPipeline, GoCDResponse } from '@/types';
import { getLastGetSentryGoCDDeploy } from '@/utils/db/getLatestDeploy';
import { getSlackMessage } from '@/utils/db/getSlackMessage';
import { saveSlackMessage } from '@/utils/db/saveSlackMessage';
import {
  filterBuildCauses,
  firstGitMaterialSHA,
  getProgressColor,
} from '@/utils/gocdHelpers';

export class DeployFeed {
  private feedName: string;
  private slackChannelID: string;
  private msgType: SlackMessage;
  private pipelineFilter: PipelineFilterCallback | undefined;
  private replyCallback:
    | ((pipeline: GoCDPipeline) => Promise<Block[]>)
    | undefined;

  constructor({
    feedName,
    channelID,
    msgType,
    pipelineFilter,
    replyCallback,
  }: DeployFeedArgs) {
    this.feedName = feedName;
    this.slackChannelID = channelID;
    this.msgType = msgType;
    this.pipelineFilter = pipelineFilter;
    this.replyCallback = replyCallback;
  }

  async handle(resBody: GoCDResponse) {
    const { pipeline } = resBody.data;

    const tx = Sentry.startTransaction({
      op: 'brain',
      name: this.feedName,
    });
    Sentry.configureScope((scope) => scope.setSpan(tx));

    try {
      await this.postUpdateToSlack(pipeline);
    } catch (err) {
      Sentry.captureException(err);
      console.error(err);
    }

    tx.finish();
  }

  parseGitHubURL(url: string) {
    const reg = /github.com[:/]([\w\-_]+)\/([\w\-_]+)/;
    const result = url.match(reg);
    if (result) {
      return {
        orgSlug: result[1],
        repoSlug: result[2],
      };
    }
    return null;
  }

  basicCommitsInDeployBlock(compareURL): MrkdwnElement {
    return slackblocks.markdown(`<${compareURL}|Commits being deployed>`);
  }

  async getSentryRevisions(
    orgSlug: string,
    repoSlug: string,
    prevDeploySHA: string,
    currentDeploySHA
  ) {
    const org = GH_ORGS.get(orgSlug);
    const responses = await Promise.all([
      org.api.repos.getContent({
        owner: org.slug,
        repo: repoSlug,
        path: 'sentry-version',
        ref: prevDeploySHA,
      }),
      org.api.repos.getContent({
        owner: org.slug,
        repo: repoSlug,
        path: 'sentry-version',
        ref: currentDeploySHA,
      }),
    ]);
    return responses.map((r) => {
      if (!('content' in r.data)) {
        throw new Error('Repo content not in response.');
      }
      if (!('encoding' in r.data)) {
        throw new Error('Repo encoding not in response.');
      }
      if (r.data.encoding !== 'base64') {
        throw new Error(`Unexpected repo content encoding: ${r.data.encoding}`);
      }
      const buff = Buffer.from(r.data.content, 'base64');
      return buff.toString('ascii').trim();
    });
  }

  compareURL(orgSlug: string, repoSlug: string, prevRef: string, ref: string) {
    return `https://github.com/${orgSlug}/${repoSlug}/compare/${prevRef}...${ref}`;
  }

  async getCommitsInDeployBlock(
    pipeline: GoCDPipeline,
    modification: GoCDModification,
    orgSlug: string,
    repoSlug: string
  ): Promise<MrkdwnElement | undefined> {
    const latestDeploy = await getLastGetSentryGoCDDeploy(
      pipeline.group,
      pipeline.name
    );
    if (!latestDeploy) {
      return;
    }

    const latestSHA = firstGitMaterialSHA(latestDeploy);
    if (!latestSHA) {
      return;
    }

    const compareURL = this.compareURL(
      orgSlug,
      repoSlug,
      latestSHA,
      modification.revision
    );
    if (repoSlug !== GETSENTRY_REPO_SLUG) {
      return this.basicCommitsInDeployBlock(compareURL);
    }

    try {
      // Getsentry comparisons aren't that useful since the majority of
      // development is on the sentry repo.
      const shas = await this.getSentryRevisions(
        orgSlug,
        repoSlug,
        latestSHA,
        modification.revision
      );

      if (shas[0] && shas[1] && shas[0] !== shas[1]) {
        const sentryCompareURL = this.compareURL(
          orgSlug,
          SENTRY_REPO_SLUG,
          shas[0],
          shas[1]
        );
        return slackblocks.markdown(
          `Commits being deployed: <${compareURL}|getsentry> | <${sentryCompareURL}|sentry>`
        );
      }
    } catch (err) {
      Sentry.captureException(err);
    }
    return this.basicCommitsInDeployBlock(compareURL);
  }

  async getShaBlock(pipeline: GoCDPipeline): Promise<KnownBlock | undefined> {
    const buildCauses = filterBuildCauses(pipeline, 'git');
    if (buildCauses.length === 0) {
      return;
    }

    const bc = buildCauses[0];
    const modification = bc.modifications[0];
    const sha = modification.revision.slice(0, 12);
    const gitConfig = bc.material['git-configuration'];
    const match = this.parseGitHubURL(gitConfig.url);

    const block: KnownBlock = {
      type: 'context',
      elements: [],
    };
    if (!match) {
      // Lo-fi version of just the commit SHA, no linking to GitHub since we
      // don't know the URL.
      block.elements.push(
        slackblocks.markdown('Deploying'),
        slackblocks.markdown(`${gitConfig.url} @ ${sha}`)
      );
    } else {
      block.elements.push(
        slackblocks.markdown('Deploying'),
        slackblocks.markdown(
          `<https://github.com/${match.orgSlug}/${match.repoSlug}/commits/${modification.revision}|${match.repoSlug}@${sha}>`
        )
      );

      const commitsBlock = await this.getCommitsInDeployBlock(
        pipeline,
        modification,
        match.orgSlug,
        match.repoSlug
      );
      if (commitsBlock) {
        block.elements.push(commitsBlock);
      }
    }
    return block;
  }

  stageMessage(pipeline: GoCDPipeline): string {
    const stage = pipeline.stage;
    switch (stage.result.toLowerCase()) {
      case 'unknown':
        return 'In progress';
      default:
        return stage.result;
    }
  }

  stageEmoji(pipeline: GoCDPipeline): string {
    const stage = pipeline.stage;
    switch (stage.result.toLowerCase()) {
      case 'passed':
        return '✅';
      case 'failed':
        return '❌';
      case 'cancelled':
        return '🛑';
      case 'unknown':
        return '⏳';
      default:
        return '❓';
    }
  }

  async getMessageBlocks(pipeline: GoCDPipeline): Promise<Array<KnownBlock>> {
    const blocks: Array<KnownBlock> = [
      slackblocks.section(
        slackblocks.markdown(`*${pipeline.group}/${pipeline.name}*`)
      ),
    ];
    const shaBlock = await this.getShaBlock(pipeline);
    if (shaBlock) {
      blocks.push(shaBlock);
    }
    blocks.push(slackblocks.divider());
    blocks.push(this.stageBlock(pipeline));

    return blocks;
  }

  stageBlock(pipeline: GoCDPipeline): KnownBlock {
    const stageOverviewURL = `${GOCD_ORIGIN}/go/pipelines/${pipeline.name}/${pipeline.counter}/${pipeline.stage.name}/${pipeline.stage.counter}`;
    return {
      type: 'context',
      elements: [
        slackblocks.markdown(
          `${this.stageEmoji(pipeline)} *${pipeline.stage.name}*`
        ),
        slackblocks.markdown(
          `<${stageOverviewURL}|${this.stageMessage(pipeline)}>`
        ),
      ],
    };
  }

  // Attachments are largely deprecated, however slack does not offer a way
  // to add the color to the side of a block, which is extremely helpful for
  // our deploy messages.
  async getMessageAttachment(
    pipeline: GoCDPipeline
  ): Promise<MessageAttachment> {
    const progressColor = getProgressColor(pipeline);

    return {
      color: progressColor,
      blocks: await this.getMessageBlocks(pipeline),
    };
  }

  async getBodyText(pipeline: GoCDPipeline) {
    let body  = '';
    if (pipeline.stage.result.toLowerCase() == 'failed') {
      body = 'GoCD deployment failed'
    } else {
      body = `GoCD deployment started`;
    }
    const approvedBy = pipeline.stage['approved-by'];
    if (approvedBy) {
      // We check for "changes" since `getUser() can return an email
      // for this even though it may not match.
      if (approvedBy === 'changes') {
        body = `GoCD auto-deployment started`;
      } else {
        const user = await getUser({ email: approvedBy });
        if (user?.slackUser) {
          body = `GoCD deployment started by <@${user.slackUser}>`;
        }
      }
    }
    return body;
  }

  async newSlackMessage(refId: string, pipeline: GoCDPipeline) {
    if (this.pipelineFilter && !this.pipelineFilter(pipeline)) {
      return;
    }

    const body = await this.getBodyText(pipeline);
    const attachment = await this.getMessageAttachment(pipeline);
    const message = await bolt.client.chat.postMessage({
      text: body,
      channel: this.slackChannelID,
      attachments: [attachment],
      unfurl_links: false,
    });

    await saveSlackMessage(
      this.msgType,
      {
        refId,
        channel: `${message.channel}`,
        ts: `${message.ts}`,
      },
      {
        text: body,
      }
    );

    return message;
  }

  async updateSlackMessage(message: any, attachment: MessageAttachment) {
    return bolt.client.chat.update({
      ts: message.ts,
      channel: this.slackChannelID,
      // NOTE: Using the message context means the message text contains
      // who initiated the deployment (either manual or an auto-deployment).
      text: message.context.text,
      attachments: [attachment],
    });
  }

  getPipelineId(pipeline: GoCDPipeline) {
    let refId = `${pipeline.group}-${pipeline.name}/${pipeline.counter}`;
    const buildCauses = filterBuildCauses(pipeline, 'git');
    if (buildCauses.length > 0) {
      const bc = buildCauses[0];
      const m = bc.modifications[0];
      refId += `@${m.revision}`;
    }
    return refId;
  }

  async postUpdateToSlack(pipeline: GoCDPipeline): Promise<void> {
    const refId = this.getPipelineId(pipeline);

    // Look for associated slack messages based on pipeline
    const messages = await getSlackMessage(this.msgType, [refId]);
    if (!messages.length) {
      const postMessage = await this.newSlackMessage(refId, pipeline);
      if (postMessage && this.replyCallback) {
        const replyBlocks = await this.replyCallback(pipeline);
        if (replyBlocks.length > 0) {
          await bolt.client.chat.postMessage({
            channel: `${postMessage.channel}`,
            thread_ts: `${postMessage.ts}`,
            text: '',
            blocks: replyBlocks,
          });
        }
      }
    } else {
      const attachment = await this.getMessageAttachment(pipeline);
      await Promise.all(
        messages.map((message) => {
          return this.updateSlackMessage(message, attachment);
        })
      );
    }
  }
}

interface DeployFeedArgs {
  feedName: string;
  channelID: string;
  msgType: SlackMessage;
  pipelineFilter?: PipelineFilterCallback;
  replyCallback?: (pipeline: GoCDPipeline) => Promise<Block[]>;
}
type PipelineFilterCallback = (pipeline: GoCDPipeline) => boolean;

import * as Sentry from '@sentry/node';
import { KnownBlock } from '@slack/types';

import { getUser } from '../../api/getUser';
import { bolt } from '../../api/slack';
import * as slackblocks from '../../blocks/slackBlocks';
import { GOCD_ORIGIN } from '../../config';
import { SlackMessage } from '../../config/slackMessage';
import { GoCDPipeline, GoCDResponse } from '../../types';
import { getSlackMessage } from '../../utils/db/getSlackMessage';
import { saveSlackMessage } from '../../utils/db/saveSlackMessage';
import { getProgressColor } from '../../utils/gocdHelpers';

export class DeployFeed {
  private feedName: string;
  private slackChannelID: string;
  private msgType: SlackMessage;
  private pipelineFilter: PipelineFilterCallback | undefined;

  constructor({
    feedName,
    channelID,
    msgType,
    pipelineFilter,
  }: DeployFeedArgs) {
    this.feedName = feedName;
    this.slackChannelID = channelID;
    this.msgType = msgType;
    this.pipelineFilter = pipelineFilter;
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
        org: result[1],
        repo: result[2],
      };
    }
    return null;
  }

  getShaBlock(pipeline): KnownBlock | undefined {
    const buildCause = pipeline['build-cause'];
    if (!buildCause || buildCause.length == 0) {
      return;
    }
    const bc = pipeline['build-cause'][0];
    if (
      !bc ||
      !bc.material ||
      bc.material.type !== 'git' ||
      bc.modifications.length == 0
    ) {
      return;
    }

    const modification = bc.modifications[0];
    const sha = modification.revision.slice(0, 12);
    const gitConfig = bc.material['git-configuration'];
    const match = this.parseGitHubURL(gitConfig.url);
    if (!match) {
      // Lo-fi version of just the commit SHA, no linking to GitHub since we
      // don't know the URL.
      return {
        type: 'context',
        elements: [
          slackblocks.markdown('Deploying'),
          slackblocks.markdown(`${gitConfig.url} @ ${sha}`),
        ],
      };
    }

    return {
      type: 'context',
      elements: [
        slackblocks.markdown('Deploying'),
        slackblocks.markdown(
          `<https://github.com/${match.org}/${match.repo}/commits/${modification.revision}|${match.repo}@${sha}>`
        ),
      ],
    };
  }

  stageMessage(pipeline: GoCDPipeline): string {
    const stage = pipeline.stage;
    switch (stage.result.toLowerCase()) {
      case 'unknown':
        return 'In progress';
    }
    return stage.result;
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
    }
    return '❓';
  }

  getMessageBlocks(pipeline: GoCDPipeline): Array<KnownBlock> {
    const blocks: Array<KnownBlock> = [
      slackblocks.section(
        slackblocks.markdown(`*${pipeline.group}/${pipeline.name}*`)
      ),
    ];
    const shaBlock = this.getShaBlock(pipeline);
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
  getMessageAttachment(pipeline: GoCDPipeline) {
    const progressColor = getProgressColor(pipeline);

    return {
      color: progressColor,
      blocks: this.getMessageBlocks(pipeline),
    };
  }

  async getBodyText(pipeline: GoCDPipeline) {
    let body = `GoCD deployment started`;
    const approvedBy = pipeline.stage['approved-by'];
    if (approvedBy) {
      // We check for "changes" since `getUser() can return an email
      // for this even though it may not match.
      if (approvedBy == 'changes') {
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
    const attachment = this.getMessageAttachment(pipeline);
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
  }

  async updateSlackMessage(message: any, pipeline: GoCDPipeline) {
    await bolt.client.chat.update({
      ts: message.ts,
      channel: this.slackChannelID,
      // NOTE: Using the message context means the message text contains
      // who initiated the deployment (either manual or an auto-deployment).
      text: message.context.text,
      attachments: [this.getMessageAttachment(pipeline)],
    });
  }

  getPipelineId(pipeline: GoCDPipeline) {
    let refId = `${pipeline.group}-${pipeline.name}/${pipeline.counter}`;
    if (pipeline['build-cause'] && pipeline['build-cause'].length > 0) {
      const bc = pipeline['build-cause'][0];
      if (bc.modifications && bc.modifications.length > 0) {
        const m = bc.modifications[0];
        refId += `@${m.revision}`;
      }
    }
    return refId;
  }

  async postUpdateToSlack(pipeline: GoCDPipeline): Promise<void> {
    const refId = this.getPipelineId(pipeline);

    // Look for associated slack messages based on pipeline
    const messages = await getSlackMessage(this.msgType, [refId]);
    if (!messages.length) {
      await this.newSlackMessage(refId, pipeline);
    } else {
      messages.forEach(async (message) => {
        await this.updateSlackMessage(message, pipeline);
      });
    }
  }
}

interface DeployFeedArgs {
  feedName: string;
  channelID: string;
  msgType: SlackMessage;
  pipelineFilter?: PipelineFilterCallback;
}
type PipelineFilterCallback = (pipeline: GoCDPipeline) => boolean;

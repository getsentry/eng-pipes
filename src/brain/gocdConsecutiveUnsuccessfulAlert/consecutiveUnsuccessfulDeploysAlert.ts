import { KnownBlock } from '@slack/types';

import { bolt } from '@/api/slack';
import * as slackblocks from '@/blocks/slackBlocks';
import { GOCD_ORIGIN } from '@/config';
import {
  DBGoCDDeployment,
  GoCDPipeline,
  GoCDResponse,
  GoCDStageResponse,
} from '@/types/gocd';
import { getLastGetSentryGoCDDeploy } from '@/utils/db/getLatestDeploy';

export const CONSECUTIVE_UNSUCCESSFUL_DEPLOYS_LIMIT = 3;

export class ConsecutiveUnsuccessfulDeploysAlert {
  private slackChannelID: string;
  private consecutiveUnsuccessfulLimit: number;
  private pipelineFilter: PipelineFilterCallback | undefined;

  constructor({
    slackChannelID,
    consecutiveUnsuccessfulLimit,
    pipelineFilter,
  }: ConsecutiveUnsuccessfulDeploysAlertArgs) {
    this.slackChannelID = slackChannelID;
    this.consecutiveUnsuccessfulLimit =
      consecutiveUnsuccessfulLimit || CONSECUTIVE_UNSUCCESSFUL_DEPLOYS_LIMIT;
    this.pipelineFilter = pipelineFilter;
  }

  async handle(body: GoCDResponse) {
    const { pipeline } = (body as GoCDStageResponse).data;

    if (this.pipelineFilter && !this.pipelineFilter(pipeline)) {
      return;
    }

    // If everything is passing or building, we don't need to check or do anything
    if (
      pipeline.stage.result.toLowerCase() === 'passed' ||
      pipeline.stage.result.toLowerCase() === 'unknown'
    ) {
      return;
    }

    const lastDeploy = await getLastGetSentryGoCDDeploy(
      pipeline.group,
      pipeline.name
    );

    if (!lastDeploy) {
      // Do nothing until we have at least one deploy
      return;
    }

    const numConsecutiveUnsuccessfulDeploys =
      Number(pipeline.counter) - Number(lastDeploy.pipeline_counter);

    if (
      numConsecutiveUnsuccessfulDeploys >= this.consecutiveUnsuccessfulLimit
    ) {
      const blocks = this.getMessageBlocks(
        pipeline,
        lastDeploy,
        numConsecutiveUnsuccessfulDeploys
      );
      await bolt.client.chat.postMessage({
        channel: this.slackChannelID,
        text: this.getBodyText(pipeline, numConsecutiveUnsuccessfulDeploys),
        blocks,
        unfurl_links: false,
      });
    }
  }

  private getBodyText(pipeline: GoCDPipeline, numConsecutiveFailures: number) {
    return `❗️ *${pipeline.name}* has had ${numConsecutiveFailures} consecutive unsuccessful deploys.`;
  }

  private getMessageBlocks(
    pipeline: GoCDPipeline,
    lastDeploy: DBGoCDDeployment,
    numConsecutiveFailures: number
  ): Array<KnownBlock> {
    const prevDeployVSMURL = `${GOCD_ORIGIN}/go/pipelines/value_stream_map/${lastDeploy.pipeline_name}/${lastDeploy.pipeline_counter}`;
    const currentOverviewURL = `${GOCD_ORIGIN}/go/pipelines/${pipeline.name}/${pipeline.counter}/${pipeline.stage.name}/${pipeline.stage.counter}`;
    const deployToolsURL = `https://deploy-tools.getsentry.net/services/${pipeline.group}`;

    return [
      slackblocks.section(
        slackblocks.markdown(this.getBodyText(pipeline, numConsecutiveFailures))
      ),
      slackblocks.section(
        slackblocks.markdown(
          `<${currentOverviewURL}|Latest failure> | <${prevDeployVSMURL}|Last good deploy> | <${deployToolsURL}|Deploy Tools>`
        )
      ),
    ];
  }
}

type ConsecutiveUnsuccessfulDeploysAlertArgs = {
  slackChannelID: string;
  consecutiveUnsuccessfulLimit?: number;
  pipelineFilter?: PipelineFilterCallback;
};

type PipelineFilterCallback = (pipeline: GoCDPipeline) => boolean;

import '@sentry/tracing';
import { v1 } from '@datadog/datadog-api-client';

import * as Sentry from '@sentry/node';
import {
  Block,
  KnownBlock,
  MrkdwnElement,
} from '@slack/types';

import { getUser } from '@/api/getUser';
import {
  GETSENTRY_REPO_SLUG,
  GH_ORGS,
  GOCD_ORIGIN,
  SENTRY_REPO_SLUG,
  DATADOG_API_INSTANCE,
} from '@/config';
import { SlackMessage } from '@/config/slackMessage';
import { GoCDPipeline, GoCDResponse } from '@/types';
import { getLastGetSentryGoCDDeploy } from '@/utils/db/getLatestDeploy';
import {
  filterBuildCauses,
  firstGitMaterialSHA,
} from '@/utils/gocdHelpers';
import moment from 'moment-timezone';




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
    return `<${compareURL}|Commits being deployed>`;
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

  getShaLink(pipeline: GoCDPipeline) {
    const buildCauses = filterBuildCauses(pipeline, 'git');
    if (buildCauses.length === 0) {
      return "";
    }

    const bc = buildCauses[0];
    const modification = bc.modifications[0];
    const sha = modification.revision.slice(0, 12);
    const gitConfig = bc.material['git-configuration'];
    const match = this.parseGitHubURL(gitConfig.url);

    if (!match) {
      // Lo-fi version of just the commit SHA, no linking to GitHub since we
      // don't know the URL.
      return `${gitConfig.url} @ ${sha}`
    } else {
      return `<https://github.com/${match.orgSlug}/${match.repoSlug}/commits/${modification.revision}|${match.repoSlug}@${sha}>`
    }
  }

  getRepoSha(pipeline: GoCDPipeline) {
    const buildCauses = filterBuildCauses(pipeline, 'git');
    if (buildCauses.length === 0) {
      return;
    }

    const bc = buildCauses[0];
    const modification = bc.modifications[0];
    const sha = modification.revision.slice(0, 12);
    const gitConfig = bc.material['git-configuration'];
    const match = this.parseGitHubURL(gitConfig.url);

    if (!match) {
      // Lo-fi version of just the commit SHA, no linking to GitHub since we
      // don't know the URL.
      return `${gitConfig.url}@${sha}`
    } else {
      return `${match.repoSlug}@${sha}`
    }
    return "";
  }

  async getCommitsDiff(pipeline: GoCDPipeline) {
    const buildCauses = filterBuildCauses(pipeline, 'git');
    if (buildCauses.length === 0) {
      return;
    }

    const bc = buildCauses[0];
    const modification = bc.modifications[0];
    const gitConfig = bc.material['git-configuration'];
    const match = this.parseGitHubURL(gitConfig.url);


    if (match) {
      const latestDeploy = await getLastGetSentryGoCDDeploy(
        pipeline.group,
        pipeline.name
      );
      if (!latestDeploy) {
        return "";
      }

      const latestSHA = firstGitMaterialSHA(latestDeploy);
      if (!latestSHA) {
        return "";
      }

      const compareURL = this.compareURL(
        match.orgSlug,
        match.repoSlug,
        latestSHA,
        modification.revision
      );
      if (match.repoSlug !== GETSENTRY_REPO_SLUG) {
        return this.basicCommitsInDeployBlock(compareURL);
      }

      try {
        // Getsentry comparisons aren't that useful since the majority of
        // development is on the sentry repo.
        const shas = await this.getSentryRevisions(
          match.orgSlug,
          match.repoSlug,
          latestSHA,
          modification.revision
        );

        if (shas[0] && shas[1] && shas[0] !== shas[1]) {
          const sentryCompareURL = this.compareURL(
            match.orgSlug,
            SENTRY_REPO_SLUG,
            shas[0],
            shas[1]
          );
          return `Commits being deployed: <${compareURL}|getsentry> | <${sentryCompareURL}|sentry>`;

        }
      } catch (err) {
        Sentry.captureException(err);
      }
      return this.basicCommitsInDeployBlock(compareURL);

    }
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

  stageLink(pipeline: GoCDPipeline): KnownBlock {
    const stageOverviewURL = `${GOCD_ORIGIN}/go/pipelines/${pipeline.name}/${pipeline.counter}/${pipeline.stage.name}/${pipeline.stage.counter}`;
    return `<${stageOverviewURL}|${this.stageMessage(pipeline)}>`;

  }

  async getBodyText(pipeline: GoCDPipeline) {
    let body = `GoCD deployment started`;
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

  getFormattedRegion(pipeline: GoCDPipeline) {
    const pipeline_name = pipeline.name
    const sentry_region_mappings = {
      's4s': 's4s',
      'us': 'us',
      'de': 'de',
      'customer-1': 'st-goldmansachs',
      'customer-2': 'st-geico',
      'customer-3': 'st-zendesk-eu',
      'customer-4': 'st-disney',
      'customer-5': 'st-securitytest',
      'customer-6': 'st-test-region',
    };
    let region = "all"

    for (const [key, value] of Object.entries(sentry_region_mappings)) {
      if (pipeline_name.includes(key)) {
        region = value;
      }
    }

    return region
  }

  async newDataDogEvent(refId: string, pipeline: GoCDPipeline) {
    if (this.pipelineFilter && !this.pipelineFilter(pipeline)) {
      return;
    }
    // GoCD deployment started in <> by auto/ user
    const bodytext = await this.getBodyText(pipeline);

    // sentry-st-region
    let region = this.getFormattedRegion(pipeline);

    // getsentry-frontend
    let service = pipeline.group;

    // getsentry@h92mfyw
    let repoSha = this.getRepoSha(pipeline);

    // Deploying getsentry@cb2961b1528f (link to git commit)
    let commitShaLink = this.getShaLink(pipeline);

    // Commits being deployed: getsentry (link to diff) | sentry (link to diff)
    let commitDiffLink = this.getCommitsDiff(pipeline);

    // deploy-primary
    let stageName = pipeline.stage.name;

    // In progress (link to gocd dashboard)
    let stageLink = this.stageLink(pipeline);

    // Failed
    let pipelineResult = pipeline.stage.result.toLowerCase();




    // Title: GoCD: deploy sha (started/failed/completed)  in <insert>-region
    let title = `GoCD: deploying ${service} ${pipelineResult} in ${region}`;
    // Automatic deploy triggered by <github push?>  to track details visit: https://deploy.getsentry.net/go/pipelines/value_stream_map/deploy-getsentry-backend-s4s/2237      
    let text = `%%% \n ${bodytext} from: ${commitShaLink}, ${commitDiffLink},  GoCD:${stageLink} \n %%%`;
    // Tags: source:gocd customer_name:s4s sentry_region:s4s source_tool:gocd sentry_user:git commit email  source_category:infra-tools
    let tags = [
      `region:${region}`,
      `source_tool:gocd`,
      `source:"gocd"`,
      `source_category:infra-tools`,
      `sentry_service:${service}`,
    ];




    return await this.sendEventToDatadog(title, text, moment().unix(), tags)
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

  async sendEventToDatadog(title: string, text: string, timestamp: string, tags: string[]) {
    const params: v1.EventCreateRequest = {
      title: title,
      text: text,
      dateHappened: timestamp,
      tags: tags,
    };
    await DATADOG_API_INSTANCE.createEvent({ body: params });
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

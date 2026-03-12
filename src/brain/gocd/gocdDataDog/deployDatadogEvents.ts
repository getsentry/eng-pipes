import '@sentry/tracing';

import { v1 } from '@datadog/datadog-api-client';
import * as Sentry from '@sentry/node';

import {
  DATADOG_API_INSTANCE,
  GETSENTRY_REPO_SLUG,
  GH_ORGS,
  GOCD_ORIGIN,
  SENTRY_REPO_SLUG,
} from '@/config';
import { GoCDPipeline, GoCDResponse } from '@/types/gocd';
import { getLastGetSentryGoCDDeploy } from '@/utils/db/getLatestDeploy';
import { getAuthors } from '@/utils/github/getAuthors';
import { getUser } from '@/utils/github/getUser';
import {
  filterBuildCauses,
  firstGitMaterialSHA,
  getBaseAndHeadCommit,
} from '@/utils/gocd/gocdHelpers';
import { isSentryEmail } from '@/utils/misc/isSentryEmail';

export class DeployDatadogEvents {
  private feedName: string;
  private pipelineFilter: PipelineFilterCallback | undefined;

  constructor({
    feedName,
    eventFilter: pipelineFilter,
  }: DeployDatadogEventsArgs) {
    this.feedName = feedName;
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
      await this.newDataDogEvent(pipeline);
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

  basicCommitsInDeploy(compareURL): string {
    return `[Commits being deployed](${compareURL})`;
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
      return '';
    }

    const bc = buildCauses[0];
    const modification = bc.modifications[0];
    const sha = modification.revision.slice(0, 12);
    const gitConfig = bc.material['git-configuration'];
    const match = this.parseGitHubURL(gitConfig.url);

    if (!match) {
      // Lo-fi version of just the commit SHA, no linking to GitHub since we
      // don't know the URL.
      return `${gitConfig.url} @ ${sha}`;
    } else {
      return `[${match.repoSlug}@${sha}](https://github.com/${match.orgSlug}/${match.repoSlug}/commits/${modification.revision})`;
    }
  }

  async getCommitsDiff(pipeline: GoCDPipeline) {
    const buildCauses = filterBuildCauses(pipeline, 'git');
    if (buildCauses.length === 0) {
      return 'no build cause';
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
        return '';
      }

      const latestSHA = firstGitMaterialSHA(latestDeploy);
      if (!latestSHA) {
        return '';
      }

      const compareURL = this.compareURL(
        match.orgSlug,
        match.repoSlug,
        latestSHA,
        modification.revision
      );
      if (match.repoSlug !== GETSENTRY_REPO_SLUG) {
        return this.basicCommitsInDeploy(compareURL);
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
          return `Commits being deployed: [getsentry](${compareURL}) | [sentry](${sentryCompareURL})`;
        }
      } catch (err) {
        Sentry.captureException(err);
      }
      return this.basicCommitsInDeploy(compareURL);
    }

    return '';
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

  stageLink(pipeline: GoCDPipeline): string {
    const stageOverviewURL = `${GOCD_ORIGIN}/go/pipelines/${pipeline.name}/${pipeline.counter}/${pipeline.stage.name}/${pipeline.stage.counter}`;
    return `[${this.stageMessage(pipeline)}](${stageOverviewURL})`;
  }

  async getBodyText(pipeline: GoCDPipeline) {
    let body = `GoCD deployment started`;
    const approvedBy = pipeline.stage['approved-by'];
    if (approvedBy) {
      // We check for "changes" since `getUser() can return an email
      // for this even though it may not match.
      if (approvedBy === 'changes') {
        body = `GoCD auto-deployment started`;
      } else if (isSentryEmail(approvedBy)) {
        const user = await getUser({ email: approvedBy });
        if (user?.slackUser) {
          body = `GoCD deployment started by <@${user.slackUser}>`;
        }
      }
    }
    return body;
  }

  getFormattedRegion(pipeline: GoCDPipeline) {
    const pipeline_name = pipeline.name;
    const sentry_region_mappings = {
      s4s: 'st-sentry4sentry',
      us: 'us',
      de: 'de',
      'customer-1': 'st-goldmansachs',
      'customer-2': 'st-geico',
      'customer-3': 'st-zendesk-eu',
      'customer-4': 'st-disney',
      'customer-6': 'st-test-region',
    };
    let region = 'all';

    for (const [key, value] of Object.entries(sentry_region_mappings)) {
      if (pipeline_name.endsWith(key)) {
        region = value;
      }
    }

    return region;
  }

  async getSentryUsers(pipeline: GoCDPipeline) {
    const buildCauses = filterBuildCauses(pipeline, 'git');
    if (buildCauses.length === 0) {
      return [];
    }

    const bc = buildCauses[0];
    const gitConfig = bc.material['git-configuration'];
    const match = this.parseGitHubURL(gitConfig.url);

    if (match) {
      const [base, head] = await getBaseAndHeadCommit(pipeline);
      const authors = head ? await getAuthors(match?.repoSlug, base, head) : [];

      return authors;
    }

    return [];
  }

  async newDataDogEvent(pipeline: GoCDPipeline) {
    if (this.pipelineFilter && !this.pipelineFilter(pipeline)) {
      return;
    }

    // let refId = this.getPipelineId(pipeline);
    // GoCD deployment started in <> by auto/ user
    const deploymentReason = await this.getBodyText(pipeline);

    // sentry-st-region
    const region = this.getFormattedRegion(pipeline);

    // getsentry-frontend
    const service = pipeline.group;

    // getsentry@h92mfyw
    // let repoSha = this.getRepoSha(pipeline);

    // Deploying getsentry@cb2961b1528f (link to git commit)
    const commitShaLink = this.getShaLink(pipeline);

    // Commits being deployed: getsentry (link to diff) | sentry (link to diff)
    const commitDiffLink = await this.getCommitsDiff(pipeline);

    // deploy-primary
    const stageName = pipeline.stage.name;

    // In progress (link to gocd dashboard)
    const stageLink = this.stageLink(pipeline);

    // Failed
    const pipelineResult = this.stageMessage(pipeline);

    const authors = await this.getSentryUsers(pipeline);

    const sentry_user_tags = authors.map((user) => `sentry_user:${user.login}`);

    // Title: GoCD: deploy sha (started/failed/completed)  in <insert>-region
    const title = `GoCD: deploying <${service}> <${stageName}> <${pipelineResult}> in ${region}`;
    // Automatic deploy triggered by <github push?>  to track details visit: https://deploy.getsentry.net/go/pipelines/value_stream_map/deploy-getsentry-backend-s4s/2237
    const text = `%%% \n${deploymentReason} from: ${commitShaLink},\n \n ${commitDiffLink} \n GoCD:${stageLink} \n\n   *this message was produced by a eng-pipes gocd brain module* \n %%%`;
    // Tags: source:gocd customer_name:s4s sentry_region:s4s source_tool:gocd sentry_user:git commit email  source_category:infra-tools
    const tags = [
      `sentry_region:${region}`,
      `source_tool:gocd`,
      `source:gocd`,
      `source_category:infra-tools`,
      `sentry_service:${service}`,
      `gocd_status:${pipelineResult}`,
      `gocd_stage:${stageName}`,
      `sentry_user:eng-pipes`,
      ...sentry_user_tags,
    ];

    return await this.sendEventToDatadog(title, text, tags);
  }

  async sendEventToDatadog(title: string, text: string, tags: string[]) {
    const params: v1.EventCreateRequest = {
      title: title,
      text: text,
      tags: tags,
    };
    await DATADOG_API_INSTANCE.createEvent({ body: params });
  }
}

interface DeployDatadogEventsArgs {
  feedName: string;
  eventFilter?: PipelineFilterCallback;
}
type PipelineFilterCallback = (pipeline: GoCDPipeline) => boolean;

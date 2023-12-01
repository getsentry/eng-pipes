import { gocdevents } from '@/api/gocdevents';
// import {
//   GOCD_SENTRYIO_BE_PIPELINE_NAME,
//   GOCD_SENTRYIO_FE_PIPELINE_NAME,
// } from '@/config';
import { GoCDResponse } from '@/types';

import { DeployDatadogEvents } from './deployDatadogEvents';

// const ENGINEERING_PIPELINE_FILTER = [
//   'deploy-getsentry-backend-s4s',
//   GOCD_SENTRYIO_BE_PIPELINE_NAME,
//   GOCD_SENTRYIO_FE_PIPELINE_NAME,
// ];

// const SNS_SAAS_PIPELINE_FILTER = [
//   'deploy-snuba',
//   'rollback-snuba',
//   'deploy-snuba-s4s',
//   'deploy-snuba-us',
//   'deploy-snuba-stable',
// ];

// const SNS_ST_PIPELINE_FILTER = [
//   'deploy-snuba-customer-1',
//   'deploy-snuba-customer-2',
//   'deploy-snuba-customer-3',
//   'deploy-snuba-customer-4',
// ];

// const DEV_INFRA_PIPELINE_FILTER = [
//   'deploy-gocd-staging',
//   'deploy-gocd-production',
//   ...ENGINEERING_PIPELINE_FILTER,
// ];

// Post all pipelines to #feed-deploys
const deployEventsDataDog = new DeployDatadogEvents({
  feedName: 'gocdDatadogFeed',
  eventFilter: (pipeline) => {
    // Start
    // filter for migration / deploy-primary
    // fail filter for non

    const isCheck = pipeline?.stage?.name?.includes('check');
    const isSoak = pipeline?.stage?.name?.includes('soak');
    const result = pipeline?.stage?.result.toLowerCase();

    //started?
    if (!isCheck && !isSoak && result === 'unknown') {
      return true;
    }

    // failed or cancelled
    if (!isCheck && (result === 'failed' || result === 'cancelled')) {
      return true;
    }

    //finished
    if (!isCheck && !isSoak && result === 'passed') {
      return true;
    }

    return false;
  },
});

export async function handler(body: GoCDResponse) {
  await Promise.all([deployEventsDataDog.handle(body)]);
}

export async function gocdDataDog() {
  gocdevents.on('stage', handler);
}

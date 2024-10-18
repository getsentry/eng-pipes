import { v1 } from '@datadog/datadog-api-client';
import * as Sentry from '@sentry/node';
import moment from 'moment-timezone';

import { DATADOG_API_INSTANCE } from '@/config';

export async function callDatadog(timestamp: number): Promise<void> {
  const params: v1.EventCreateRequest = {
    title: 'Infra Hub Update',
    text: 'Infra Hub is up',
    alertType: 'error',
    dateHappened: timestamp,
    tags: [
      `source_tool:infra-hub`,
      `source:infra-hub`,
      `source_category:infra-tools`,
      `sentry_user:infra-hub`,
    ],
  };
  await DATADOG_API_INSTANCE.createEvent({ body: params });
}

export async function heartbeat() {
  try {
    await callDatadog(moment().unix());
  } catch (err) {
    Sentry.captureException(err);
  }
}

import { v1 } from '@datadog/datadog-api-client';
import * as Sentry from '@sentry/node';
import moment from 'moment-timezone';

import { DATADOG_API_INSTANCE } from '@/config';

export async function callDatadog(timestamp: number): Promise<void> {
  const params: v1.EventCreateRequest = {
    title: 'Infra Hub Update',
    text: 'Infra Hub is up',
    alertType: 'info',
    dateHappened: timestamp,
    tags: [
      'source_tool:infra-hub',
      'source:infra-hub',
      'source_category:infra-tools',
      'sentry_user:infra-hub',
    ],
  };
  await DATADOG_API_INSTANCE.createEvent({ body: params });
}

export async function heartbeat() {
  const checkInId = Sentry.captureCheckIn(
    {
      monitorSlug: 'infra-hub-heartbeat',
      status: 'in_progress',
    },
    {
      schedule: {
        type: 'crontab',
        value: '*/5 * * * *',
      },
      checkinMargin: 1,
      maxRuntime: 1,
      timezone: 'America/Los_Angeles',
    }
  );
  try {
    await callDatadog(moment().unix());

    Sentry.captureCheckIn({
      checkInId,
      monitorSlug: 'infra-hub-heartbeat',
      status: 'ok',
    });
  } catch (err) {
    Sentry.captureException(err);
    Sentry.captureCheckIn({
      checkInId,
      monitorSlug: 'infra-hub-heartbeat',
      status: 'error',
    });
  }
}

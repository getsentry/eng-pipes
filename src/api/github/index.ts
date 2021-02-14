import { Webhooks } from '@octokit/webhooks';
import * as Sentry from '@sentry/node';

const githubEvents = new Webhooks({
  secret: process.env.GH_WEBHOOK_SECRET,
});

githubEvents.onError((err) => {
  if (process.env.ENV !== 'production') {
    console.error(err);
  }

  Sentry.captureException(err);
});

export { githubEvents };

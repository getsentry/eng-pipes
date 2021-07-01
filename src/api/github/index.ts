import { Webhooks } from '@octokit/webhooks';
import * as Sentry from '@sentry/node';

const githubEvents = new Webhooks({
  secret: process.env.GH_WEBHOOK_SECRET,
});

// Set up default error handling in such a way that tests can override it.
function defaultErrorHandler(error) {
  if (process.env.ENV !== 'production') {
    console.error(error);
  }
  Sentry.captureException(error);
}

githubEvents.onError(defaultErrorHandler);

export { githubEvents, defaultErrorHandler };

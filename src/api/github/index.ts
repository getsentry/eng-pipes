import { Webhooks } from '@octokit/webhooks';
import * as Sentry from '@sentry/node';
import { DISABLE_GITHUB_VERIFICATION } from '@/config';

const githubEvents = new Webhooks({
  secret: process.env.GH_WEBHOOK_SECRET || '',
});
if (DISABLE_GITHUB_VERIFICATION) {
  githubEvents.verifyAndReceive = async (event) => {
    return githubEvents.receive({
      id: event.id,
      name: event.name as any,
      payload: event.payload as any,
    });
  };
}

// Set up default error handling in such a way that tests can override it.
function defaultErrorHandler(error) {
  if (process.env.ENV !== 'production') {
    console.error(error);
  }
  Sentry.captureException(error);
}

githubEvents.onError(defaultErrorHandler);

export { githubEvents, defaultErrorHandler };

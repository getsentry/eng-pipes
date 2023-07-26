import { Webhooks } from '@octokit/webhooks';
import * as Sentry from '@sentry/node';

import { OctokitWithRetries } from './octokitWithRetries';

const githubEvents = new Webhooks({
  secret: process.env.GH_WEBHOOK_SECRET || '',
});

// Set up default error handling in such a way that tests can override it.
function defaultErrorHandler(error) {
  if (process.env.ENV !== 'production') {
    console.error(error);
  }
  Sentry.captureException(error);
}

githubEvents.onError(defaultErrorHandler);

function makeUserTokenClient(token: string) {
  if (!token) {
    throw new Error('No token. Try setting GH_USER_TOKEN.');
  }
  return new OctokitWithRetries({ auth: token });
}

export { githubEvents, defaultErrorHandler, makeUserTokenClient };

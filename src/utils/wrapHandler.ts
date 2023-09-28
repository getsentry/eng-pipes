import '@sentry/tracing';

import * as Sentry from '@sentry/node';

export function wrapHandler(name: string, fn: Function) {
  return async (...args: any[]) => {
    const tx = Sentry.startTransaction({
      op: 'brain',
      name,
    });
    Sentry.configureScope((scope) => {
      scope.setSpan(tx);
    });

    const result = await fn.call(null, ...args);

    tx.finish();
    return result;
  };
}

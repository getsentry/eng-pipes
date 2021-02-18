import * as Sentry from '@sentry/node';

export function wrapHandler(name: string, fn: Function) {
  console.log(fn.name);
  return async (...args: any[]) => {
    const tx = Sentry.startTransaction({
      op: 'handler',
      name,
    });
    Sentry.configureScope((scope) => {
      scope.setSpan(tx);
    });

    const result = await fn.call(null, ...args);
    tx.finish();
    console.log(tx);

    return result;
  };
}

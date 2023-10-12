import { isGetsentryRequiredCheck } from '.';

import { REQUIRED_CHECK_NAME } from '~/config';

describe('isGetsentryRequiredCheck', function () {
  let payload;
  let checkRun;

  beforeAll(function () {
    const checkRun = {
      status: 'completed',
      name: REQUIRED_CHECK_NAME,
    };
    payload = {
      repository: {
        full_name: 'getsentry/getsentry',
      },
      check_run: checkRun,
    };
  });

  it('works', function () {
    expect(
      // @ts-ignore
      isGetsentryRequiredCheck({
        payload,
      })
    ).toBe(true);
  });

  it('only works for getsentry', function () {
    expect(
      // @ts-ignore
      isGetsentryRequiredCheck({
        payload: {
          ...payload,
          repository: {
            full_name: 'getsentry/sentry',
          },
        },
      })
    ).toBe(false);
  });

  it('ignores incomplete checks', function () {
    expect(
      // @ts-ignore
      isGetsentryRequiredCheck({
        payload: {
          ...payload,
          check_run: {
            ...checkRun,
            status: 'in_progress',
          },
        },
      })
    ).toBe(false);

    expect(
      // @ts-ignore
      isGetsentryRequiredCheck({
        payload: {
          ...payload,
          check_run: {
            ...checkRun,
            status: 'queued',
          },
        },
      })
    ).toBe(false);
  });

  it('ignores irrelevant check runs', function () {
    expect(
      // @ts-ignore
      isGetsentryRequiredCheck({
        payload: {
          ...payload,
          check_run: {
            ...checkRun,
            name: 'backend test',
          },
        },
      })
    ).toBe(false);
  });
});

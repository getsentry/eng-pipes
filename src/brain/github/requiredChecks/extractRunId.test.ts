import { extractRunId } from './extractRunId';

test.each([
  [
    'https://github.com/getsentry/getsentry/runs/4327813370?check_suite_focus=true',
    '4327813370',
  ],
  [
    '[acceptance test](https://github.com/getsentry/getsentry/runs/4327813370?check_suite_focus=true)',
    '4327813370',
  ],
  [
    '<https://github.com/getsentry/getsentry/runs/4327813370?check_suite_focus=true|acceptance test>',
    '4327813370',
  ],
  [
    'https://github.com/foo/getsentry/runs/4327813370?check_suite_focus=true',
    undefined,
  ],
  [
    'https://github.com/getsentry/sentry/runs/4327813370?check_suite_focus=true',
    undefined,
  ],
])('can extract a run id from %s', function (url, id) {
  expect(extractRunId(url)).toBe(id);
});

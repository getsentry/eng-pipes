import { isSentrySlackUser } from './isSentrySlackUser';

describe('isSentrySlackUser', function () {
  it('must have a `@sentry.io` e-mail addres', function () {
    expect(
      isSentrySlackUser({ id: 'U123', profile: { email: 'test@sentry.io' } })
    ).toBe(true);
    expect(
      isSentrySlackUser({
        id: 'U123',
        profile: { email: 'test@not-sentry.io' },
      })
    ).toBe(false);
  });

  it('must have a confirmed e-mail addres', function () {
    expect(
      isSentrySlackUser({
        id: 'U123',
        is_email_confirmed: true,
        profile: { email: 'test@sentry.io' },
      })
    ).toBe(true);
    expect(
      isSentrySlackUser({
        id: 'U123',
        is_email_confirmed: false,
        profile: { email: 'test@sentry.io' },
      })
    ).toBe(false);
  });
});

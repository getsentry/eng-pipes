import { isSentryEmail } from './isSentryEmail';

describe('isSentryEmail', function () {
  it('returns true for a Sentry email', () => {
    expect(isSentryEmail('shashank.jarmale@sentry.io')).toBe(true);
    expect(isSentryEmail('ian.woodard@sentry.io')).toBe(true);
  });

  it('returns false for non Sentry emails', () => {
    expect(isSentryEmail('blah@example.com')).toBe(false);
    expect(isSentryEmail('test@email.com')).toBe(false);
    expect(isSentryEmail('changes')).toBe(false);
  });
});

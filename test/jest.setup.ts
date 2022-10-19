/* eslint-env jest */
jest.mock('@api/slack');
jest.mock('@api/github/getClient');
jest.mock('@utils/loadBrain');

// Force tests use a specific set of values for config and
// ignore the process.env values.
jest.mock('@/config', () => {
  const originalModule = jest.requireActual('@/config');
  return {
    ...originalModule,
    OWNER: 'getsentry',
    GETSENTRY_REPO: 'getsentry',
    SENTRY_REPO: 'sentry',
  };
});

/* eslint-env jest */
jest.mock('../src/api/slack');
jest.mock('../src/api/github/getClient');
jest.mock('../src/utils/loadBrain');

// Force tests use a specific set of values for config and
// ignore the process.env values.
jest.mock('../src/config', () => {
  const originalModule = jest.requireActual('../src/config');
  return {
    ...originalModule,
    OWNER: 'getsentry',
    GETSENTRY_REPO: 'getsentry',
    SENTRY_REPO: 'sentry',
  };
});

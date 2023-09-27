import getStatsMessage from './getStatsMessage';

jest.mock('./getOwnershipData', () =>
  jest.fn(() => ({
    team1: {
      block_start: 1,
      public: ['p1'],
      private: [],
      experimental: [],
      unknown: [],
    },
    team2: {
      block_start: 7,
      public: [],
      private: [],
      experimental: ['e1'],
      unknown: ['u1', 'u2'],
    },
  }))
);
describe('api stats', function () {
  it('calculates team stats', async function () {
    const response = await getStatsMessage('team1');
    expect(response.message).toBe(
      'Publish status for team1 APIs:\n' +
        '• public: 1 (100%) :party-sunglasses-blob: \n' +
        '• private: 0 (0%)  \n' +
        '• experimental: 0 (0%) :party-sunglasses-blob: \n' +
        '• unknown: 0 (0%) :party-sunglasses-blob: \n'
    );
  });

  it('calculates overall stats', async function () {
    const response = await getStatsMessage('');
    expect(response.message).toBe(
      'Team Name            | Public(%) | Private(%) | Experimental(%) | Unknown(%)\n' +
        '<https://github.com/getsentry/sentry/blob/master/src/sentry/apidocs/api_ownership_stats_dont_modify.json#L1|team1>                | 100       | 0          | 0               | 0         \n' +
        '<https://github.com/getsentry/sentry/blob/master/src/sentry/apidocs/api_ownership_stats_dont_modify.json#L7|team2>                | 0   ☒     | 0          | 33  ☒           | 67  ☒     \n'
    );
  });
});

const originalWebApi = jest.requireActual('@slack/web-api');

jest.mock('@slack/web-api', () => ({
  ...originalWebApi,
  WebClient: jest.fn(() => {
    const user = {
      id: 'U789123',
      profile: {
        email: 'test@sentry.io',
      },
    };

    return {
      auth: {
        test: jest.fn(() =>
          Promise.resolve({
            user_id: 'user_id',
            bot_id: 'bot_id',
          })
        ),
      },
      chat: {
        postMessage: jest.fn(() =>
          // TODO: this is incomplete
          Promise.resolve({
            channel: 'channel_id',
            ts: '1234123.123',
          })
        ),
        update: jest.fn(() => {
          return Promise.resolve({});
        }),
        postEphemeral: jest.fn(() => Promise.resolve({ ok: true })),
      },
      users: {
        info: jest.fn(() =>
          Promise.resolve({
            ok: true,
            user,
          })
        ),
        lookupByEmail: jest.fn(() =>
          Promise.resolve({
            ok: true,
            user,
          })
        ),
        profile: {
          set: jest.fn(() => Promise.resolve({})),
          get: jest.fn(() =>
            Promise.resolve({
              ok: true,
              profile: {
                fields: {},
              },
            })
          ),
        },
      },
    };
  }),
}));

const bolt = jest.requireActual('@api/slack').bolt;

/**
 * Need to do this otherwise we can't test expectations against injected client
 */
class WebClientPool {
  getOrCreate() {
    return bolt.client;
  }
}

bolt.clients['T018UAQ7YRW'] = new WebClientPool();

export { bolt };

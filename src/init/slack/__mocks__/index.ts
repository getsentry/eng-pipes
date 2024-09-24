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
        postMessage: jest.fn(({ channel }) =>
          // TODO: this is incomplete
          Promise.resolve({
            channel: channel,
            ts: '1234123.123',
            message: {
              bot_id: 'B01834PAJDT',
              type: 'message',
              text: ':sentry-loading: fetching status ...',
              user: 'U018UAXJVG8',
              ts: '1234123.123',
              team: 'T018UAQ7YRW',
              bot_profile: {
                id: 'B01834PAJDT',
                deleted: false,
                name: 'Bot Name',
                updated: 1596673914,
                app_id: 'A017XPC80S2',
                icons: [],
                team_id: 'T018UAQ7YRW',
              },
            },
          })
        ),
        update: jest.fn(() => {
          return Promise.resolve({});
        }),
        postEphemeral: jest.fn(() => Promise.resolve({ ok: true })),
      },
      conversations: {
        info: jest.fn(() =>
          Promise.resolve({ channel: { name: 'test-channel' } })
        ),
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
      views: {
        publish: jest.fn(() => Promise.resolve({})),
        open: jest.fn(() =>
          Promise.resolve({
            view: {
              id: 'viewId',
              hash: 'viewHash',
            },
          })
        ),
        update: jest.fn(() => Promise.resolve({})),
      },
    };
  }),
}));

const bolt = jest.requireActual('@/init/slack').bolt;

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

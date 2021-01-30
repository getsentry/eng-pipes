import { buildServer } from '@app/buildServer';
import { createSignature } from '@utils/createSignature';
import { web } from '@api/slack';
import getProgress from '@app/handlers/apps/slack/getProgress';

jest.mock('@api/slack', () => ({
  web: {
    chat: {
      postMessage: jest.fn(() => Promise.resolve({})),
      update: jest.fn(() => Promise.resolve({})),
    },
  },
  slackEvents: jest.requireActual('@api/slack').slackEvents,
}));

jest.mock('@app/handlers/apps/slack/getProgress', () =>
  jest.fn(() => ({
    progress: 1,
    remainingFiles: 2,
  }))
);

const payload = {
  token: 'foo',
  team_id: 'T018UAQ7YRW',
  api_app_id: 'api_app_id',
  event: {
    client_msg_id: 'd9285761-0feb-44f1-8854-aecaf9aad3a2',
    type: 'app_mention',
    text: '<@U018UAXJVG8> typescript',
    user: 'U018H4DA8N5',
    ts: '1611956722.000900',
    team: 'T018UAQ7YRW',
    blocks: [
      {
        type: 'rich_text',
        block_id: 'uxfe',
        elements: [
          {
            type: 'rich_text_section',
            elements: [
              { type: 'user', user_id: 'U018UAXJVG8' },
              { type: 'text', text: ' typescript' },
            ],
          },
        ],
      },
    ],
    channel: 'G018X8Y9B1N',
    event_ts: '1611956722.000900',
  },
  type: 'event_callback',
  event_id: 'Ev01L6RZSB9C',
  event_time: 1611956722,
  authed_users: ['U018UAXJVG8'],
  authorizations: [
    {
      enterprise_id: null,
      team_id: 'T018UAQ7YRW',
      user_id: 'U018UAXJVG8',
      is_bot: true,
      is_enterprise_install: false,
    },
  ],
  is_ext_shared_channel: false,
  event_context: '1-app_mention-T018UAQ7YRW-G018X8Y9B1N',
};

function createSlackSignature(payload, timestamp) {
  return createSignature(
    `v0:${timestamp}:${JSON.stringify(payload)}`,
    process.env.SLACK_SIGNING_SECRET || '',
    (i) => i,
    'sha256'
  );
}

describe('slack app', function () {
  let fastify;

  beforeEach(function () {
    fastify = buildServer();
  });

  afterEach(function () {
    fastify.close();
  });

  it('fetches typescript status', async function () {
    const now = +new Date();
    const signature = createSlackSignature(payload, now);

    const response = await fastify.inject({
      method: 'POST',
      url: '/apps/slack/events',
      headers: {
        'x-slack-request-timestamp': now,
        'x-slack-signature': `v0=${signature}`,
      },
      payload,
    });
    expect(response.statusCode).toBe(200);
    expect(web.chat.postMessage).toHaveBeenCalledTimes(1);
    expect(getProgress).toHaveBeenCalledWith({});
    expect(getProgress).toHaveBeenCalledWith({
      repo: 'getsentry',
      basePath: 'static/getsentry',
      appDir: 'gsApp',
    });
    expect(web.chat.update).toHaveBeenCalledTimes(1);
    expect(web.chat.update).toHaveBeenCalledWith({
      blocks: [
        {
          text: {
            text: ':typescript: progress: *1%* completed, *4* files remaining',
            type: 'mrkdwn',
          },
          type: 'section',
        },
        {
          text: {
            text: `• *sentry:* 2 files remain (1%)
• *getsentry:* 2 files remain (1%)`,
            type: 'mrkdwn',
          },
          type: 'section',
        },
      ],
      channel: 'undefined',
      text: 'TypeScript progress: 1% completed, 4 files remaining',
      ts: 'undefined',
    });
  });
});

import { saveSlackMessage } from './saveSlackMessage';
import { db } from '.';

import { SlackMessage } from '~/config/slackMessage';

describe('saveSlackMessage', function () {
  beforeAll(async function () {
    await db.migrate.latest();
  });

  afterAll(async function () {
    await db.destroy();
  });

  beforeEach(async function () {});

  afterEach(async function () {
    await db('slack_messages').delete();
  });

  it('saves a new message', async function () {
    await saveSlackMessage(
      SlackMessage.REQUIRED_CHECK,
      {
        refId: '9999',
        channel: 'channel',
        ts: '1234.000',
      },
      {
        test: 'foo',
      }
    );

    const slackMessages = await db('slack_messages').select('*');

    expect(slackMessages).toHaveLength(1);
    expect(slackMessages[0]).toMatchObject({
      channel: 'channel',
      context: {
        test: 'foo',
      },
      refId: '9999',
      ts: '1234.000',
      type: 'required-check',
    });
  });

  it('updates an existing  message', async function () {
    // @ts-ignore
    const [res] = await saveSlackMessage(
      SlackMessage.REQUIRED_CHECK,
      {
        refId: '9999',
        channel: 'channel',
        ts: '1234.000',
      },
      {
        test: 'foo',
        another: 'foo',
      }
    );

    await saveSlackMessage(
      SlackMessage.REQUIRED_CHECK,
      {
        id: res.id,
      },
      {
        another: 'bar',
        anew: 'baz',
      }
    );

    const slackMessages = await db('slack_messages').select('*');

    expect(slackMessages).toHaveLength(1);
    expect(slackMessages[0]).toMatchObject({
      channel: 'channel',
      context: {
        anew: 'baz',
        another: 'bar',
        test: 'foo',
      },
      refId: '9999',
      ts: '1234.000',
      type: 'required-check',
    });
  });
});

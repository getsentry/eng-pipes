import { SlackMessage } from '@/config/slackMessage';
import { db } from '@utils/db';
import { saveSlackMessage } from '@utils/db/saveSlackMessage';

import { getFailureMessages } from './getFailureMessages';

describe('getFailureMessages', function () {
  beforeAll(async function () {
    await db.migrate.latest();
  });

  afterAll(async function () {
    await db.destroy();
  });

  afterEach(async function () {
    await db('slack_messages').delete();
  });

  it('initially is not failing', async function () {
    expect(await getFailureMessages()).toEqual([]);
  });

  it('is failing', async function () {
    await saveSlackMessage(
      SlackMessage.REQUIRED_CHECK,
      {
        refId: '999999',
        channel: 'channel',
        ts: '123.123',
      },
      {
        status: 'failure',
        failed_at: new Date(),
      }
    );
    expect(await getFailureMessages()).toHaveLength(1);
  });

  it('ignores failed tests older than 2 hours', async function () {
    const now = new Date();
    now.setHours(now.getHours() - 3);
    await saveSlackMessage(
      SlackMessage.REQUIRED_CHECK,
      {
        refId: '999999',
        channel: 'channel',
        ts: '123.123',
      },
      {
        status: 'failure',
        failed_at: now,
      }
    );
    expect(await getFailureMessages()).toEqual([]);
  });

  it('can fetch all failed tests', async function () {
    const now = new Date();
    now.setHours(now.getHours() - 3);
    await saveSlackMessage(
      SlackMessage.REQUIRED_CHECK,
      {
        refId: '999999',
        channel: 'channel',
        ts: '123.123',
      },
      {
        status: 'failure',
        failed_at: now,
      }
    );
    expect(await getFailureMessages(null)).toHaveLength(1);
  });
});

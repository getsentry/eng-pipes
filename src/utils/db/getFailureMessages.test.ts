import { getFailureMessages } from './getFailureMessages';

import { GETSENTRY_ORG } from '~/src/config';
import { SlackMessage } from '~/src/config/slackMessage';
import { db } from '~/src/utils/db';
import { saveSlackMessage } from '~/src/utils/db/saveSlackMessage';

describe('getFailureMessages', function () {
  const org = GETSENTRY_ORG;

  beforeAll(async function () {
    await db.migrate.latest();
  });

  beforeEach(async function () {
    org.api.mockClear();
  });

  afterAll(async function () {
    await db.destroy();
  });

  afterEach(async function () {
    await db('slack_messages').delete();
    org.api.repos.compareCommits.mockClear();
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

  it('returns messages only for older (or identical) commits', async function () {
    await saveSlackMessage(
      SlackMessage.REQUIRED_CHECK,
      {
        refId: '111',
        channel: 'channel',
        ts: '123.123',
      },
      {
        status: 'failure',
        failed_at: new Date(),
      }
    );

    // `222` represents newer commit
    expect(await getFailureMessages(null, '222')).toHaveLength(1);

    // Same commit as exists in slack messages
    expect(await getFailureMessages(null, '111')).toHaveLength(1);
  });

  it('does not return messages for commits newer input commit sha', async function () {
    await saveSlackMessage(
      SlackMessage.REQUIRED_CHECK,
      {
        refId: '222',
        channel: 'channel',
        ts: '123.123',
      },
      {
        status: 'failure',
        failed_at: new Date(),
      }
    );

    // `111` is a commit that is older than `222`
    expect(await getFailureMessages(null, '111')).toHaveLength(0);
  });
});

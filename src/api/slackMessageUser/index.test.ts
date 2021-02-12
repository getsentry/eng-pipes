import { bolt } from '@api/slack';
import { SLACK_PROFILE_ID_GITHUB } from '@app/config';
import { db } from '@utils/db';

import { slackMessageUser } from './';

describe('slackMessageUser', function () {
  beforeAll(async function () {
    await db.migrate.latest();
  });

  afterAll(async function () {
    await db.migrate.rollback();
    await db.destroy();
  });

  beforeEach(async function () {
    // @ts-ignore
    bolt.client.chat.postMessage.mockClear();
    // @ts-ignore
    // bolt.client.users.profile.get.mockClear();
    await db('users').delete();
  });

  it('messages user if no preferences are set', async function () {
    await slackMessageUser('U1234', { text: 'Testing' });
    expect(bolt.client.chat.postMessage).toHaveBeenCalledWith({
      channel: 'U1234',
      text: 'Testing',
    });
  });

  it('does not message user if they have slack notifications disabled', async function () {
    const user = {
      email: 'test@sentry.io',
      slackUser: 'U1234',
      githubUser: 'githubUser',
    };
    const [userId] = await db('users').returning('id').insert(user);

    const result = await db('user_preferences').insert({
      userId,
      preferences: { disableSlackNotifications: true },
    });

    await slackMessageUser('U1234', { text: 'Testing' });
    expect(bolt.client.chat.postMessage).not.toHaveBeenCalled();
  });
});

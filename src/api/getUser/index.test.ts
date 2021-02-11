import { bolt } from '@api/slack';
import { SLACK_PROFILE_ID_GITHUB } from '@app/config';
import { db } from '@utils/db';

import { getUser } from './';

describe('getUser', function () {
  beforeAll(async function () {
    await db.migrate.latest();
  });

  beforeEach(async function () {
    await db('users').delete();
  });

  it('fetches existing user from db via email, slack, and/or github', async function () {
    const user = {
      email: 'test@sentry.io',
      slackUser: 'U1234',
      githubUser: 'githubUser',
    };
    await db('users').insert(user);

    expect(await getUser({ email: 'test@sentry.io' })).toMatchObject(user);
    expect(await getUser({ github: 'githubUser' })).toMatchObject(user);
    expect(await getUser({ slack: 'U1234' })).toMatchObject(user);
    expect(
      await getUser({ email: 'test@sentry.io', slack: 'U1234' })
    ).toMatchObject(user);
  });

  it('returns null if not in db and no email supplied', async function () {
    expect(await getUser({ github: 'githubUser' })).toBe(null);
  });

  it('fetches user from slack via email and saves to db', async function () {
    const user = await getUser({ email: 'test@sentry.io' });
    expect(bolt.client.users.lookupByEmail).toHaveBeenCalledWith({
      email: 'test@sentry.io',
    });

    expect(bolt.client.users.profile.get).toHaveBeenCalledWith({
      user: 'U789123',
    });

    const userDb = await db('users')
      .where('email', 'test@sentry.io')
      .first('*');

    expect(userDb).toMatchObject({
      email: 'test@sentry.io',
      slackUser: 'U789123',
      githubUser: null,
    });
  });

  it('fetches user from slack via email, and github user from slack profile, saves to db', async function () {
    // @ts-ignore
    bolt.client.users.profile.get.mockReset();
    // @ts-ignore
    bolt.client.users.profile.get.mockReturnValue({
      ok: true,
      profile: {
        fields: {
          [SLACK_PROFILE_ID_GITHUB]: {
            value: 'githubLogin',
          },
        },
      },
    });

    const user = await getUser({ email: 'test@sentry.io' });

    expect(bolt.client.users.lookupByEmail).toHaveBeenCalledWith({
      email: 'test@sentry.io',
    });
    expect(bolt.client.users.profile.get).toHaveBeenCalledWith({
      user: 'U789123',
    });

    const userDb = await db('users')
      .where('email', 'test@sentry.io')
      .first('*');

    expect(userDb).toMatchObject({
      email: 'test@sentry.io',
      slackUser: 'U789123',
      githubUser: 'githubLogin',
    });
    expect(user).toMatchObject({
      email: 'test@sentry.io',
      slackUser: 'U789123',
      githubUser: 'githubLogin',
    });
  });

  it('', async function () {});
  it('', async function () {});
  it('', async function () {});
  it('', async function () {});
  it('', async function () {});
  it('', async function () {});
  it('', async function () {});
  it('', async function () {});
});

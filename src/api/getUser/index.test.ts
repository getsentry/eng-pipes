import { getUser } from './';

import { bolt } from '~/api/slack';
import { SLACK_PROFILE_ID_GITHUB } from '~/config';
import { db } from '~/utils/db';

describe('getUser', function () {
  beforeAll(async function () {
    await db.migrate.latest();
  });

  afterAll(async function () {
    await db.destroy();
  });

  beforeEach(async function () {});

  afterEach(async function () {
    // @ts-ignore
    bolt.client.users.lookupByEmail.mockClear();
    // @ts-ignore
    bolt.client.users.profile.get.mockClear();
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
    expect(await getUser({ githubUser: 'githubUser' })).toMatchObject(user);
    expect(await getUser({ slackUser: 'U1234' })).toMatchObject(user);
    expect(
      await getUser({ email: 'test@sentry.io', slackUser: 'U1234' })
    ).toMatchObject(user);
  });

  it('returns null if not in db and no email supplied', async function () {
    expect(await getUser({ githubUser: 'githubUser' })).toBe(null);
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
    expect(user).toMatchObject({
      email: 'test@sentry.io',
      slackUser: 'U789123',
      githubUser: null,
    });
  });

  it('fails to find user from slack via email, github user from parameters, saves to db', async function () {
    // @ts-ignore
    bolt.client.users.lookupByEmail.mockReturnValueOnce({
      ok: false,
      user: {
        profile: {
          email: 'test@sentry.io',
        },
      },
    });

    const user = await getUser({
      email: 'test@sentry.io',
      githubUser: 'realGithubUser',
    });

    expect(bolt.client.users.lookupByEmail).toHaveBeenCalledWith({
      email: 'test@sentry.io',
    });
    expect(bolt.client.users.profile.get).not.toHaveBeenCalled();

    const userDb = await db('users')
      .where('email', 'test@sentry.io')
      .first('*');

    expect(userDb).toMatchObject({
      email: 'test@sentry.io',
      slackUser: null,
      githubUser: 'realGithubUser',
    });
    expect(user).toMatchObject({
      email: 'test@sentry.io',
      slackUser: null,
      githubUser: 'realGithubUser',
    });
  });

  it('fetches user from slack via user id, saves to db', async function () {
    const user = await getUser({
      slackUser: 'U789123',
      githubUser: 'githubUser',
    });

    expect(bolt.client.users.info).toHaveBeenCalledWith({
      user: 'U789123',
    });
    expect(bolt.client.users.profile.get).toHaveBeenCalledTimes(1);

    const userDb = await db('users')
      .where('email', 'test@sentry.io')
      .first('*');

    expect(userDb).toMatchObject({
      email: 'test@sentry.io',
      slackUser: 'U789123',
      githubUser: 'githubUser',
    });
    expect(user).toMatchObject({
      email: 'test@sentry.io',
      slackUser: 'U789123',
      githubUser: 'githubUser',
    });
  });

  it('fetches user from slack via email, github user from slack profile, saves to db', async function () {
    // @ts-ignore
    bolt.client.users.profile.get.mockReturnValueOnce({
      ok: true,
      profile: {
        fields: {
          [SLACK_PROFILE_ID_GITHUB]: {
            value: 'https://github.com/realGithubUser',
          },
        },
      },
    });

    const user = await getUser({
      email: 'test@sentry.io',
    });

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
      githubUser: 'realGithubUser',
    });
    expect(user).toMatchObject({
      email: 'test@sentry.io',
      slackUser: 'U789123',
      githubUser: 'realGithubUser',
    });
  });

  it('handles conflicts by merging fields instead of creating a new row', async function () {
    await db('users').insert({
      email: 'test@sentry.io',
      slackUser: 'UWRONG',
      githubUser: 'wrong',
    });
    const user = await getUser({
      githubUser: 'githubUser',
      email: 'test@sentry.io',
    });

    expect(bolt.client.users.lookupByEmail).toHaveBeenCalledWith({
      email: 'test@sentry.io',
    });

    expect(bolt.client.users.profile.get).toHaveBeenCalledWith({
      user: 'U789123',
    });

    const userDb = await db('users').where('email', 'test@sentry.io');

    expect(userDb.length).toBe(1);
    expect(userDb[0]).toMatchObject({
      email: 'test@sentry.io',
      slackUser: 'U789123',
      githubUser: 'githubUser',
    });
    expect(user).toMatchObject({
      email: 'test@sentry.io',
      slackUser: 'U789123',
      githubUser: 'githubUser',
    });
  });

  it('deny access to deleted user accounts', async function () {
    // @ts-ignore
    bolt.client.users.lookupByEmail.mockReturnValueOnce({
      ok: true,
      user: {
        deleted: true,
      },
    });

    const user = await getUser({
      email: 'test@sentry.io',
      githubUser: 'realGithubUser',
    });

    expect(bolt.client.users.lookupByEmail).toHaveBeenCalledWith({
      email: 'test@sentry.io',
    });
    expect(bolt.client.users.profile.get).not.toHaveBeenCalled();
    expect(user).toBe(null);
  });

  it('deny access to user accounts without emails confirmed', async function () {
    // @ts-ignore
    bolt.client.users.lookupByEmail.mockReturnValueOnce({
      ok: true,
      user: {
        is_email_confirmed: false,
      },
    });

    const user = await getUser({
      email: 'test@sentry.io',
      githubUser: 'realGithubUser',
    });

    expect(bolt.client.users.lookupByEmail).toHaveBeenCalledWith({
      email: 'test@sentry.io',
    });
    expect(bolt.client.users.profile.get).not.toHaveBeenCalled();
    expect(user).toBe(null);
  });

  it('does not store non-sentry emails', async function () {
    const user = await getUser({
      email: 'test@gmail.io',
      githubUser: 'githubUser',
    });

    expect(bolt.client.users.lookupByEmail).not.toHaveBeenCalled();
    expect(bolt.client.users.profile.get).not.toHaveBeenCalled();
    expect(user).toBe(null);
  });
});

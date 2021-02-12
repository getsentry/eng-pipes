import { bolt } from '@api/slack';
import { SLACK_PROFILE_ID_GITHUB } from '@app/config';
import { db } from '@utils/db';

import { getUser } from './';

describe('getUser', function () {
  beforeAll(async function () {
    await db.migrate.latest();
  });

  afterAll(async function () {
    await db.migrate.rollback();
    await db.destroy();
  });

  beforeEach(async function () {
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
      githubUser: undefined,
    });
  });

  it('fetches user from slack via email, and github user from parameters, saves to db', async function () {
    // @ts-ignore
    bolt.client.users.lookupByEmail.mockReturnValueOnce({
      ok: false,
      user: {},
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
      slackUser: undefined,
      githubUser: 'realGithubUser',
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

    console.log('check profile call');

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

  it.only('handles conflicts by merging fields instead of creating a new row', async function () {
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
    // .first('*');
    console.log(userDb);

    expect(userDb.length).toBe(1);
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
});

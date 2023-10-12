import { createSlackEvent } from '@test/utils/createSlackEvent';

import { syncUserProfileChange } from '.';

import { bolt } from '~/api/slack';
import { buildServer } from '~/buildServer';
import { SLACK_PROFILE_ID_GITHUB } from '~/config';
import { db } from '~/utils/db';

describe('syncUserProfileChange', function () {
  let fastify;

  beforeAll(async function () {
    await db.migrate.latest();
  });

  afterAll(async function () {
    await db.destroy();
  });

  beforeEach(async function () {
    fastify = await buildServer(false);
    syncUserProfileChange();
  });

  afterEach(async function () {
    fastify.close();
    // @ts-ignore
    bolt.client.users.profile.get.mockClear();
    await db('users').delete();
  });

  it('does not fetch GitHub profile field on `user_change` if custom profile field is in event', async function () {
    const resp = await createSlackEvent(fastify, 'user_change', {
      user: {
        id: 'U789123',
        is_email_confirmed: true,
        deleted: false,
        profile: {
          email: 'test@sentry.io',
          fields: {
            [SLACK_PROFILE_ID_GITHUB]: { value: 'githubUser!' },
          },
        },
      },
    });

    expect(resp.statusCode).toBe(200);
    expect(bolt.client.users.profile.get).not.toHaveBeenCalled();

    const user = await db('users').first('*');
    expect(user).toMatchObject({
      githubUser: 'githubUser!',
      slackUser: 'U789123',
      email: 'test@sentry.io',
    });
  });

  it('does not update db if email is not from sentry.io', async function () {
    const resp = await createSlackEvent(fastify, 'user_change', {
      user: {
        id: 'U789123',
        is_email_confirmed: true,
        deleted: false,
        profile: {
          email: 'test@not-sentry.io',
        },
      },
    });

    expect(resp.statusCode).toBe(200);
    const user = await db('users').first('*');
    expect(user).toBeUndefined();
  });

  it('does not update db if email is not confirmed', async function () {
    const resp = await createSlackEvent(fastify, 'user_change', {
      user: {
        id: 'U789123',
        is_email_confirmed: false,
        deleted: false,
        profile: {
          email: 'test@sentry.io',
        },
      },
    });

    expect(resp.statusCode).toBe(200);
    const user = await db('users').first('*');
    expect(user).toBeUndefined();
  });

  it('does not update db if user account is deleted', async function () {
    const resp = await createSlackEvent(fastify, 'user_change', {
      user: {
        id: 'U789123',
        is_email_confirmed: true,
        deleted: true,
        profile: {
          email: 'test@sentry.io',
        },
      },
    });

    expect(resp.statusCode).toBe(200);
    const user = await db('users').first('*');
    expect(user).toBeUndefined();
  });
});

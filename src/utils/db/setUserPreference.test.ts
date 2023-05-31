import { setUserPreference } from './setUserPreference';
import { db } from './';

describe('setUserPreference', function () {
  beforeAll(async function () {
    await db.migrate.latest();
  });

  afterAll(async function () {
    await db.destroy();
  });
  afterEach(async function () {
    await db('users').delete();
  });

  it('sets user preference for a new user', async function () {
    await setUserPreference(
      {
        slackUser: 'U1234',
        email: 'test@sentry.io',
      },
      { myPreference: true }
    );

    expect(await db('users').first('*')).toMatchObject({
      slackUser: 'U1234',
      email: 'test@sentry.io',
    });

    expect(await db('users').first('*')).toMatchObject({
      preferences: {
        myPreference: true,
      },
    });
  });

  it('sets user preference for an existing user', async function () {
    await db('users').insert({
      slackUser: 'U1234',
      email: 'test@sentry.io',
    });
    const result = await setUserPreference(
      {
        email: 'test@sentry.io',
        slackUser: 'U1234',
      },
      { myPreference: true }
    );
    expect(await db('users').select('*')).toHaveLength(1);
    expect(result).toBe(true);
    expect(await db('users').first('*')).toMatchObject({
      preferences: {
        myPreference: true,
      },
    });

    await setUserPreference(
      {
        email: 'test@sentry.io',
        slackUser: 'U1234',
      },
      { newPreference: false }
    );

    expect(await db('users').first('*')).toMatchObject({
      preferences: {
        myPreference: true,
        newPreference: false,
      },
    });
  });
});

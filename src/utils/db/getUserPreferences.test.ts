import { db } from '@utils/db';

import { getUserPreferences } from './getUserPreferences';

describe('getUserPreference', function () {
  beforeAll(async function () {
    await db.migrate.latest();
  });

  afterAll(async function () {
    await db.destroy();
  });

  afterEach(async function () {
    await db('users').delete();
  });

  it('get user preference for a user', async function () {
    await db('users').insert({
      email: 'test@sentry.io',
      preferences: {
        myPref: true,
      },
    });
    expect(
      await getUserPreferences({
        email: 'test@sentry.io',
      })
    ).toMatchObject({
      email: 'test@sentry.io',
      preferences: {
        myPref: true,
      },
    });
  });

  it('returns undefined for invalid user', async function () {
    expect(
      await getUserPreferences({
        email: 'test@sentry.io',
        slackUser: 'U1234',
      })
    ).toBe(undefined);
  });
});

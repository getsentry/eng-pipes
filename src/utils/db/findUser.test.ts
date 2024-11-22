import { db } from '@utils/db';
import { findUser } from '@utils/db/findUser';

describe('findUser', function () {
  beforeAll(async function () {
    await db.migrate.latest();
  });

  afterAll(async function () {
    await db.destroy();
  });

  beforeEach(async function () {
    await db('users').insert({
      email: '1@sentry.io',
      githubUser: 'githubUser',
    });
  });

  afterEach(async function () {
    await db('users').delete();
  });

  it('finds a user by email', async () => {
    const users = await findUser({ email: '1@sentry.io' });
    expect(users.length).toBe(1);
  });

  it('finds a user with exact match', async () => {
    const users = await findUser({ githubUser: 'githubUser' });
    expect(users.length).toBe(1);
  });

  it('finds github users case-insensitively', async () => {
    const users = await findUser({ githubUser: 'githubuser' });
    expect(users.length).toBe(1);
  });
});

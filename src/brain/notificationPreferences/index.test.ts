import { notificationPreferences } from '.';

import { bolt } from '~/src/api/slack';
import { buildServer } from '~/src/buildServer';
import { db } from '~/src/utils/db';
import { setUserPreference } from '~/src/utils/db/setUserPreference';
import { createSlackMessage } from '~/test/utils/createSlackMessage';

// @ts-ignore
jest.spyOn(db.context, 'raw');

jest.mock('~/src/utils/db/setUserPreference', () => ({
  setUserPreference: jest.fn(() => true),
}));

describe('notificationPreferences', function () {
  let fastify;

  beforeAll(async function () {
    await db.migrate.latest();
  });

  afterAll(async function () {
    await db.destroy();
  });

  beforeEach(async function () {
    fastify = await buildServer(false);
    notificationPreferences();
    // @ts-ignore
    bolt.client.chat.postEphemeral.mockClear();
    // @ts-ignore
    bolt.client.chat.update.mockClear();
  });

  afterEach(function () {
    fastify.close();
  });

  it('turns deploy notifications off', async function () {
    const resp = await createSlackMessage(fastify, 'deploy notifications off');

    expect(resp.statusCode).toBe(200);

    expect(setUserPreference).toHaveBeenCalledWith(
      {
        slackUser: 'U018H4DA8N5',
      },
      { disableSlackNotifications: true }
    );
    expect(bolt.client.chat.postEphemeral).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Deploy notifications: *off*',
      })
    );
  });
});

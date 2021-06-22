import { transformEventAndPayload } from '@test/utils/createGitHubEvent';

import { UNTRIAGED_LABEL } from '@/config';
import { bolt } from '@api/slack';
import { db } from '@utils/db';

import { getLabelsTable, githubLabelHandler } from '.';

const NUM_CHANNELS = 2;

const channelId = (i: number) => `CHNLIDRND${i}`;

describe('githubLabelHandler', function () {
  beforeAll(async function () {
    await db.migrate.latest();
    for (let i = 1; i <= NUM_CHANNELS; i++) {
      await getLabelsTable().insert({
        label_name: 'Team: Test',
        channel_id: channelId(i),
      });
    }
  });

  afterAll(async function () {
    await db.destroy();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test.each([
    ['Random label', { label: { name: 'Random Label', id: 'random' } }, false],
    [
      'Only team label',
      { label: { name: 'Team: Test', id: 'test-id' } },
      false,
    ],
    [
      `Team label on ${UNTRIAGED_LABEL}`,
      {
        label: { name: 'Team: Test', id: 'test-id1' },
        issue: { labels: [{ name: UNTRIAGED_LABEL, id: 'test-id2' }] },
      },
      true,
    ],
    [
      `Only ${UNTRIAGED_LABEL}`,
      { label: { name: UNTRIAGED_LABEL, id: 'test-id' } },
      false,
    ],
    [
      `${UNTRIAGED_LABEL} on Team label`,
      {
        label: { name: UNTRIAGED_LABEL, id: 'test-id1' },
        issue: { labels: [{ name: 'Team: Test', id: 'test-id2' }] },
      },
      true,
    ],
    [
      `Random label on Team + ${UNTRIAGED_LABEL}`,
      {
        label: { name: 'Random Label', id: 'random' },
        issue: {
          labels: [
            { name: UNTRIAGED_LABEL, id: 'test-id1' },
            { name: 'Team: Test', id: 'test-id2' },
          ],
        },
      },
      false,
    ],
  ])('%s', async (_name, payload, shouldNotify) => {
    const eventPayload = transformEventAndPayload('issues', {
      action: 'labeled',
      ...payload,
    })[1];
    await githubLabelHandler({
      id: 'random-event-id',
      name: 'issues',
      payload: eventPayload,
    });

    if (shouldNotify) {
      expect(bolt.client.chat.postMessage).toBeCalledTimes(NUM_CHANNELS);
      for (let i = 1; i <= NUM_CHANNELS; i++) {
        expect(bolt.client.chat.postMessage).toHaveBeenCalledWith({
          text:
            '⏲ Issue pending triage: <https://github.com/Enterprise/Hello-World/issues/1|#1 Spelling error in the README file>',
          channel: channelId(i),
        });
      }
    } else {
      expect(bolt.client.chat.postMessage).not.toBeCalled();
    }
  });
});

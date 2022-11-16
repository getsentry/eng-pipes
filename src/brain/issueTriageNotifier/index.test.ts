import { hydrateGitHubEventAndPayload } from '@test/utils/github';

import { UNROUTED_LABEL, UNTRIAGED_LABEL } from '@/config';
import { bolt } from '@api/slack';
import { db } from '@utils/db';

import { getLabelsTable, githubLabelHandler, slackHandler } from '.';

const NUM_CHANNELS = 2;

const channelId = (i: number) => `CHNLIDRND${i}`;

describe('issueTriageNotifier Tests', function () {
  beforeAll(async function () {
    await db.migrate.latest();
    for (let i = 1; i <= NUM_CHANNELS; i++) {
      await getLabelsTable().insert({
        label_name: 'Team: Test',
        channel_id: channelId(i),
        office: 'sfo',
      });
    }
  });

  afterAll(async function () {
    await db.destroy();
  });

  describe('githubLabelHandler', function () {
    beforeEach(() => {
      jest.clearAllMocks();
    });
    test.each([
      [
        'Random label',
        { label: { name: 'Random Label', id: 'random' } },
        false,
      ],
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
      const eventPayload = hydrateGitHubEventAndPayload('issues', {
        action: 'labeled',
        ...payload,
      }).payload;
      await githubLabelHandler({
        id: 'random-event-id',
        name: 'issues',
        payload: eventPayload,
      });

      if (shouldNotify) {
        expect(bolt.client.chat.postMessage).toBeCalledTimes(NUM_CHANNELS);
        for (let i = 1; i <= NUM_CHANNELS; i++) {
          expect(bolt.client.chat.postMessage).toHaveBeenCalledWith({
            text: '⏲ Issue pending triage: <https://github.com/Enterprise/Hello-World/issues/1|#1 Spelling error in the README file>',
            channel: channelId(i),
          });
        }
      } else {
        expect(bolt.client.chat.postMessage).not.toBeCalled();
      }
    });

    it('should notify support channel if issue comes in with unrouted label', async function () {
      const payload = { label: { name: UNROUTED_LABEL, id: 'random' } };
      const eventPayload = hydrateGitHubEventAndPayload('issues', {
        action: 'labeled',
        ...payload,
      }).payload;
      await githubLabelHandler({
        id: 'random-event-id',
        name: 'issues',
        payload: eventPayload,
      });
      expect(bolt.client.chat.postMessage).toHaveBeenLastCalledWith({
        channel: 'C02KHRNRZ1B',
        text: '⏲ Issue pending routing: <https://github.com/Enterprise/Hello-World/issues/1|#1 Spelling error in the README file>',
      });
    });
  });

  describe('slackHandler', function () {
    let say, respond, client, ack;
    beforeAll(async function () {
      say = jest.fn();
      respond = jest.fn();
      client = {
        conversations: {
          info: jest
            .fn()
            .mockReturnValue({ channel: { name: 'test', is_member: true } }),
          join: jest.fn(),
        },
      };
      ack = jest.fn();
    });

    it('should respond that channel is not subscribed to any team notifications if channel does not exist', async function () {
      const channel_id = channelId(3);
      const command = {
        channel_id,
        channel_name: 'test',
        text: '',
      };
      await slackHandler({ command, ack, say, respond, client });
      expect(say.mock.calls[0]).toEqual([
        'This channel is not subscribed to any team notifications.',
      ]);
      expect(await getLabelsTable().where({ channel_id })).toEqual([]);
    });

    it('should respond that channel is subscribed to team test', async function () {
      const channel_id = channelId(1);
      const command = {
        channel_id,
        channel_name: 'test',
        text: '',
      };
      await slackHandler({ command, ack, say, respond, client });
      expect(say.mock.calls[1]).toEqual([
        'This channel is set to receive notifications for: Team: Test (sfo)',
      ]);
      expect(await getLabelsTable().where({ channel_id })).toEqual([
        {
          channel_id: 'CHNLIDRND1',
          id: 1,
          label_name: 'Team: Test',
          office: 'sfo',
        },
      ]);
    });

    it('should change office to sea', async function () {
      const channel_id = channelId(1);
      const command = {
        channel_id,
        channel_name: 'test',
        text: 'Test sea',
      };
      await slackHandler({ command, ack, say, respond, client });
      expect(say.mock.calls[2]).toEqual([
        'Set office location to sea on the current channel (test) for Team: Test',
      ]);
      expect(await getLabelsTable().where({ channel_id })).toEqual([
        {
          channel_id: 'CHNLIDRND1',
          id: 1,
          label_name: 'Team: Test',
          office: 'sea',
        },
      ]);
    });

    it('should not change office if office input is invalid', async function () {
      const channel_id = channelId(1);
      const command = {
        channel_id,
        channel_name: 'test',
        text: 'Test blah',
      };
      await slackHandler({ command, ack, say, respond, client });
      expect(say.mock.calls[3]).toEqual([
        'This channel is set to receive notifications for: Team: Test (sea)',
      ]);
      expect(await getLabelsTable().where({ channel_id })).toEqual([
        {
          channel_id: 'CHNLIDRND1',
          id: 1,
          label_name: 'Team: Test',
          office: 'sea',
        },
      ]);
    });

    it('should change office to sfo', async function () {
      const channel_id = channelId(1);
      const command = {
        channel_id,
        channel_name: 'test',
        text: 'Test sfo',
      };
      await slackHandler({ command, ack, say, respond, client });
      expect(say.mock.calls[4]).toEqual([
        'Set office location to sfo on the current channel (test) for Team: Test',
      ]);
      expect(await getLabelsTable().where({ channel_id })).toEqual([
        {
          channel_id: 'CHNLIDRND1',
          id: 1,
          label_name: 'Team: Test',
          office: 'sfo',
        },
      ]);
    });

    it('should change office to vie', async function () {
      const channel_id = channelId(1);
      const command = {
        channel_id,
        channel_name: 'test',
        text: 'Test vie',
      };
      await slackHandler({ command, ack, say, respond, client });
      expect(say.mock.calls[5]).toEqual([
        'Set office location to vie on the current channel (test) for Team: Test',
      ]);
      expect(await getLabelsTable().where({ channel_id })).toEqual([
        {
          channel_id: 'CHNLIDRND1',
          id: 1,
          label_name: 'Team: Test',
          office: 'vie',
        },
      ]);
    });

    it('should change office to yyz', async function () {
      const channel_id = channelId(1);
      const command = {
        channel_id,
        channel_name: 'test',
        text: 'Test yyz',
      };
      await slackHandler({ command, ack, say, respond, client });
      expect(say.mock.calls[6]).toEqual([
        'Set office location to yyz on the current channel (test) for Team: Test',
      ]);
      expect(await getLabelsTable().where({ channel_id })).toEqual([
        {
          channel_id: 'CHNLIDRND1',
          id: 1,
          label_name: 'Team: Test',
          office: 'yyz',
        },
      ]);
    });

    it('should not delete notifications for Team test if office is incorrect', async function () {
      const channel_id = channelId(1);
      const command = {
        channel_id,
        channel_name: 'test',
        text: '-Test sea',
      };
      await slackHandler({ command, ack, say, respond, client });
      expect(say.mock.calls[7]).toEqual([
        'This channel (test) is not subscribed to Team: Test during sea business hours.',
      ]);
      expect(await getLabelsTable().where({ channel_id })).toEqual([
        {
          channel_id: 'CHNLIDRND1',
          id: 1,
          label_name: 'Team: Test',
          office: 'yyz',
        },
      ]);
    });

    it('should delete notifications for Team test', async function () {
      const channel_id = channelId(1);
      const command = {
        channel_id,
        channel_name: 'test',
        text: '-Test yyz',
      };
      await slackHandler({ command, ack, say, respond, client });
      expect(say.mock.calls[8]).toEqual([
        'This channel (test) will no longer get notifications for Team: Test during yyz business hours.',
      ]);
      expect(await getLabelsTable().where({ channel_id })).toEqual([]);
    });
  });
});

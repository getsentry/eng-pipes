import { hydrateGitHubEventAndPayload } from '@test/utils/github';

import { UNROUTED_LABEL, UNTRIAGED_LABEL } from '@/config';
import { bolt } from '@api/slack';
import { db } from '@utils/db';

import { getLabelsTable, githubLabelHandler, slackHandler } from '.';

const NUM_CHANNELS = 2;

const channelId = (i: number) => `CHNLIDRND${i}`;

describe('issueNotifier Tests', function () {
  beforeAll(async function () {
    await db.migrate.latest();
    for (let i = 1; i <= NUM_CHANNELS; i++) {
      await getLabelsTable().insert({
        label_name: 'Team: Test',
        channel_id: channelId(i),
        offices: null,
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

    it('should not notify support channel if issue comes in with random label', async function () {
      const payload = { label: { name: 'random label', id: 'random' } };
      const eventPayload = hydrateGitHubEventAndPayload('issues', {
        action: 'labeled',
        ...payload,
      }).payload;
      await githubLabelHandler({
        id: 'random-event-id',
        name: 'issues',
        payload: eventPayload,
      });
      expect(bolt.client.chat.postMessage).toBeCalledTimes(0);
      expect(bolt.client.chat.postMessage).not.toHaveBeenLastCalledWith({
        channel: 'C02KHRNRZ1B',
        text: '⏲ Issue ready to route: <https://github.com/Enterprise/Hello-World/issues/1|#1 Spelling error in the README file>',
      });
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
      expect(bolt.client.chat.postMessage).toBeCalledTimes(1);
      expect(bolt.client.chat.postMessage).toHaveBeenLastCalledWith({
        channel: 'C02KHRNRZ1B',
        text: '⏲ Issue ready to route: <https://github.com/Enterprise/Hello-World/issues/1|#1 Spelling error in the README file>',
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
        text: '',
      };
      await slackHandler({ command, ack, say, respond, client });
      expect(say).lastCalledWith(
        'This channel is not subscribed to any team notifications.'
      );
      expect(await getLabelsTable().where({ channel_id })).toEqual([]);
    });

    it('should respond that channel is subscribed to team test if office is null', async function () {
      const channel_id = channelId(1);
      const command = {
        channel_id,
        text: '',
      };
      await slackHandler({ command, ack, say, respond, client });
      expect(say).lastCalledWith(
        'This channel is set to receive notifications for: Team: Test (no office specified)'
      );
      expect(await getLabelsTable().where({ channel_id })).toEqual([
        {
          channel_id: 'CHNLIDRND1',
          id: 1,
          label_name: 'Team: Test',
          offices: null,
        },
      ]);
    });

    it('should add sfo office', async function () {
      const channel_id = channelId(1);
      const command = {
        channel_id,
        text: 'Test sfo',
      };
      await slackHandler({ command, ack, say, respond, client });
      expect(say).lastCalledWith(
        'Add office location sfo on the current channel (test) for Team: Test'
      );
      expect(await getLabelsTable().where({ channel_id })).toEqual([
        {
          channel_id: 'CHNLIDRND1',
          id: 1,
          label_name: 'Team: Test',
          offices: ['sfo'],
        },
      ]);
    });

    it('should respond that channel is subscribed to team test if office is sfo', async function () {
      const channel_id = channelId(1);
      const command = {
        channel_id,
        text: '',
      };
      await slackHandler({ command, ack, say, respond, client });
      expect(say).lastCalledWith(
        'This channel is set to receive notifications for: Team: Test (sfo)'
      );
      expect(await getLabelsTable().where({ channel_id })).toEqual([
        {
          channel_id: 'CHNLIDRND1',
          id: 1,
          label_name: 'Team: Test',
          offices: ['sfo'],
        },
      ]);
    });

    it('should add sea office', async function () {
      const channel_id = channelId(1);
      const command = {
        channel_id,
        text: 'Test sea',
      };
      await slackHandler({ command, ack, say, respond, client });
      expect(say).lastCalledWith(
        'Add office location sea on the current channel (test) for Team: Test'
      );
      expect(await getLabelsTable().where({ channel_id })).toEqual([
        {
          channel_id: 'CHNLIDRND1',
          id: 1,
          label_name: 'Team: Test',
          offices: ['sfo', 'sea'],
        },
      ]);
    });

    it('should not add office if office input is invalid', async function () {
      const channel_id = channelId(1);
      const command = {
        channel_id,
        text: 'Test blah',
      };
      await slackHandler({ command, ack, say, respond, client });
      expect(say).lastCalledWith(
        'This channel is set to receive notifications for: Team: Test (sfo, sea)'
      );
      expect(await getLabelsTable().where({ channel_id })).toEqual([
        {
          channel_id: 'CHNLIDRND1',
          id: 1,
          label_name: 'Team: Test',
          offices: ['sfo', 'sea'],
        },
      ]);
    });

    it('should add vie office', async function () {
      const channel_id = channelId(1);
      const command = {
        channel_id,
        text: 'Test vie',
      };
      await slackHandler({ command, ack, say, respond, client });
      expect(say).lastCalledWith(
        'Add office location vie on the current channel (test) for Team: Test'
      );
      expect(await getLabelsTable().where({ channel_id })).toEqual([
        {
          channel_id: 'CHNLIDRND1',
          id: 1,
          label_name: 'Team: Test',
          offices: ['sfo', 'sea', 'vie'],
        },
      ]);
    });

    it('should add yyz office', async function () {
      const channel_id = channelId(1);
      const command = {
        channel_id,
        text: 'Test yyz',
      };
      await slackHandler({ command, ack, say, respond, client });
      expect(say).lastCalledWith(
        'Add office location yyz on the current channel (test) for Team: Test'
      );
      expect(await getLabelsTable().where({ channel_id })).toEqual([
        {
          channel_id: 'CHNLIDRND1',
          id: 1,
          label_name: 'Team: Test',
          offices: ['sfo', 'sea', 'vie', 'yyz'],
        },
      ]);
    });

    it('should delete notifications for Team test for office sea', async function () {
      const channel_id = channelId(1);
      const command = {
        channel_id,
        text: '-Test sea',
      };
      await slackHandler({ command, ack, say, respond, client });
      expect(say).lastCalledWith(
        'This channel (test) will no longer get notifications for Team: Test during sea business hours.'
      );
      expect(await getLabelsTable().where({ channel_id })).toEqual([
        {
          channel_id: 'CHNLIDRND1',
          id: 1,
          label_name: 'Team: Test',
          offices: ['sfo', 'vie', 'yyz'],
        },
      ]);
    });

    it('should not delete notifications for Team test if office is not included', async function () {
      const channel_id = channelId(1);
      const command = {
        channel_id,
        text: '-Test sea',
      };
      await slackHandler({ command, ack, say, respond, client });
      expect(say).lastCalledWith(
        'This channel (test) is not subscribed to Team: Test during sea business hours.'
      );
      expect(await getLabelsTable().where({ channel_id })).toEqual([
        {
          channel_id: 'CHNLIDRND1',
          id: 1,
          label_name: 'Team: Test',
          offices: ['sfo', 'vie', 'yyz'],
        },
      ]);
    });

    it('should delete notifications for Team test for office yyz', async function () {
      const channel_id = channelId(1);
      const command = {
        channel_id,
        text: '-Test yyz',
      };
      await slackHandler({ command, ack, say, respond, client });
      expect(say).lastCalledWith(
        'This channel (test) will no longer get notifications for Team: Test during yyz business hours.'
      );
      expect(await getLabelsTable().where({ channel_id })).toEqual([
        {
          channel_id: 'CHNLIDRND1',
          id: 1,
          label_name: 'Team: Test',
          offices: ['sfo', 'vie'],
        },
      ]);
    });

    it('should delete notifications for Team test for office sfo', async function () {
      const channel_id = channelId(1);
      const command = {
        channel_id,
        text: '-Test sfo',
      };
      await slackHandler({ command, ack, say, respond, client });
      expect(say).lastCalledWith(
        'This channel (test) will no longer get notifications for Team: Test during sfo business hours.'
      );
      expect(await getLabelsTable().where({ channel_id })).toEqual([
        {
          channel_id: 'CHNLIDRND1',
          id: 1,
          label_name: 'Team: Test',
          offices: ['vie'],
        },
      ]);
    });

    it('should delete notifications for Team test for office vie', async function () {
      const channel_id = channelId(1);
      const command = {
        channel_id,
        text: '-Test vie',
      };
      await slackHandler({ command, ack, say, respond, client });
      expect(say).lastCalledWith(
        'This channel (test) will no longer get notifications for Team: Test during vie business hours.'
      );
      expect(await getLabelsTable().where({ channel_id })).toEqual([]);
    });
  });
});

import { hydrateGitHubEventAndPayload } from '@test/utils/github';

import {
  WAITING_FOR_PRODUCT_OWNER_LABEL,
  WAITING_FOR_SUPPORT_LABEL,
} from '@/config';
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
        label_name: 'Product Area: Test',
        channel_id: channelId(i),
        offices: null,
      });
    }
  });

  afterAll(async function () {
    await db('label_to_channel').delete();
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
        'Only product area label',
        { label: { name: 'Product Area: Test', id: 'test-id' } },
        false,
      ],
      [
        `Product Area label on ${WAITING_FOR_PRODUCT_OWNER_LABEL}`,
        {
          label: { name: 'Product Area: Test', id: 'test-id1' },
          issue: {
            labels: [{ name: WAITING_FOR_PRODUCT_OWNER_LABEL, id: 'test-id2' }],
          },
        },
        true,
      ],
      [
        `Only ${WAITING_FOR_PRODUCT_OWNER_LABEL}`,
        { label: { name: WAITING_FOR_PRODUCT_OWNER_LABEL, id: 'test-id' } },
        false,
      ],
      [
        `${WAITING_FOR_PRODUCT_OWNER_LABEL} on Product Area label`,
        {
          label: { name: WAITING_FOR_PRODUCT_OWNER_LABEL, id: 'test-id1' },
          issue: { labels: [{ name: 'Product Area: Test', id: 'test-id2' }] },
        },
        true,
      ],
      [
        `Random label on Product Area + ${WAITING_FOR_PRODUCT_OWNER_LABEL}`,
        {
          label: { name: 'Random Label', id: 'random' },
          issue: {
            labels: [
              { name: WAITING_FOR_PRODUCT_OWNER_LABEL, id: 'test-id1' },
              { name: 'Product Area: Test', id: 'test-id2' },
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
            text: '⏲ A wild issue has appeared! <https://github.com/getsentry/Hello-World/issues/1|#1 Spelling error in the README file>',
            channel: channelId(i),
            unfurl_links: false,
            unfurl_media: false,
          });
        }
      } else {
        expect(bolt.client.chat.postMessage).not.toBeCalled();
      }
    });

    it('should escape issue titles with < or > characters', async function () {
      const payload = {
        label: { name: 'Product Area: Test', id: 'random' },
        issue: {
          labels: [{ name: WAITING_FOR_PRODUCT_OWNER_LABEL, id: 'test-id2' }],
        },
      };
      const eventPayload = hydrateGitHubEventAndPayload('issues', {
        action: 'labeled',
        ...payload,
      }).payload;
      eventPayload.issue.title = '<Title with < and > characters>';
      await githubLabelHandler({
        id: 'random-event-id',
        name: 'issues',
        payload: eventPayload,
      });
      expect(bolt.client.chat.postMessage).toHaveBeenLastCalledWith({
        channel: 'CHNLIDRND2',
        text: '⏲ A wild issue has appeared! <https://github.com/getsentry/Hello-World/issues/1|#1 &lt;Title with &lt; and &gt; characters&gt;>',
        unfurl_links: false,
        unfurl_media: false,
      });
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
        text: '⏲ Issue ready to route: <https://github.com/getsentry/Hello-World/issues/1|#1 Spelling error in the README file>',
        unfurl_links: false,
        unfurl_media: false,
      });
    });

    it('should notify support channel if issue comes in with waiting for support label', async function () {
      const payload = {
        label: { name: WAITING_FOR_SUPPORT_LABEL, id: 'random' },
      };
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
        text: '⏲ Issue ready to route: <https://github.com/getsentry/Hello-World/issues/1|#1 Spelling error in the README file>',
        unfurl_links: false,
        unfurl_media: false,
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

    it('should respond that channel is not subscribed to any product area notifications if channel does not exist', async function () {
      const channel_id = channelId(3);
      const command = {
        channel_id,
        text: '',
      };
      await slackHandler({ command, ack, say, respond, client });
      expect(say).lastCalledWith(
        'This channel is not subscribed to any product area notifications.'
      );
      expect(await getLabelsTable().where({ channel_id })).toEqual([]);
    });

    it('should add new subscription to product area for channel', async function () {
      const channel_id = channelId(3);
      const command = {
        channel_id,
        text: 'Test sea',
      };
      await slackHandler({ command, ack, say, respond, client });
      expect(say).lastCalledWith(
        "Set untriaged issue notifications for 'Product Area: Test' on the current channel (test). Notifications will come in during sea business hours."
      );
      expect(await getLabelsTable().where({ channel_id })).toMatchObject([
        {
          channel_id: 'CHNLIDRND3',
          label_name: 'Product Area: Test',
          offices: ['sea'],
        },
      ]);
    });

    it('should respond that channel is subscribed to product area test if office is null', async function () {
      const channel_id = channelId(1);
      const command = {
        channel_id,
        text: '',
      };
      await slackHandler({ command, ack, say, respond, client });
      expect(say).lastCalledWith(
        'This channel is set to receive notifications for: Product Area: Test (no office specified)'
      );
      expect(await getLabelsTable().where({ channel_id })).toMatchObject([
        {
          channel_id: 'CHNLIDRND1',
          label_name: 'Product Area: Test',
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
        'Add office location sfo on the current channel (test) for Product Area: Test'
      );
      expect(await getLabelsTable().where({ channel_id })).toMatchObject([
        {
          channel_id: 'CHNLIDRND1',
          label_name: 'Product Area: Test',
          offices: ['sfo'],
        },
      ]);
    });

    it('should respond that channel is subscribed to product area test if office is sfo', async function () {
      const channel_id = channelId(1);
      const command = {
        channel_id,
        text: '',
      };
      await slackHandler({ command, ack, say, respond, client });
      expect(say).lastCalledWith(
        'This channel is set to receive notifications for: Product Area: Test (sfo)'
      );
      expect(await getLabelsTable().where({ channel_id })).toMatchObject([
        {
          channel_id: 'CHNLIDRND1',
          label_name: 'Product Area: Test',
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
        'Add office location sea on the current channel (test) for Product Area: Test'
      );
      expect(await getLabelsTable().where({ channel_id })).toMatchObject([
        {
          channel_id: 'CHNLIDRND1',
          label_name: 'Product Area: Test',
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
        'This channel is set to receive notifications for: Product Area: Test (sfo, sea)'
      );
      expect(await getLabelsTable().where({ channel_id })).toMatchObject([
        {
          channel_id: 'CHNLIDRND1',
          label_name: 'Product Area: Test',
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
        'Add office location vie on the current channel (test) for Product Area: Test'
      );
      expect(await getLabelsTable().where({ channel_id })).toMatchObject([
        {
          channel_id: 'CHNLIDRND1',
          label_name: 'Product Area: Test',
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
        'Add office location yyz on the current channel (test) for Product Area: Test'
      );
      expect(await getLabelsTable().where({ channel_id })).toMatchObject([
        {
          channel_id: 'CHNLIDRND1',
          label_name: 'Product Area: Test',
          offices: ['sfo', 'sea', 'vie', 'yyz'],
        },
      ]);
    });

    it('should delete notifications for Product Area test for office sea', async function () {
      const channel_id = channelId(1);
      const command = {
        channel_id,
        text: '-Test sea',
      };
      await slackHandler({ command, ack, say, respond, client });
      expect(say).lastCalledWith(
        'This channel (test) will no longer get notifications for Product Area: Test during sea business hours.'
      );
      expect(await getLabelsTable().where({ channel_id })).toMatchObject([
        {
          channel_id: 'CHNLIDRND1',
          label_name: 'Product Area: Test',
          offices: ['sfo', 'vie', 'yyz'],
        },
      ]);
    });

    it('should not delete notifications for Product Area test if office is not included', async function () {
      const channel_id = channelId(1);
      const command = {
        channel_id,
        text: '-Test sea',
      };
      await slackHandler({ command, ack, say, respond, client });
      expect(say).lastCalledWith(
        'This channel (test) is not subscribed to Product Area: Test during sea business hours.'
      );
      expect(await getLabelsTable().where({ channel_id })).toMatchObject([
        {
          channel_id: 'CHNLIDRND1',
          label_name: 'Product Area: Test',
          offices: ['sfo', 'vie', 'yyz'],
        },
      ]);
    });

    it('should delete notifications for Product Area test for office yyz', async function () {
      const channel_id = channelId(1);
      const command = {
        channel_id,
        text: '-Test yyz',
      };
      await slackHandler({ command, ack, say, respond, client });
      expect(say).lastCalledWith(
        'This channel (test) will no longer get notifications for Product Area: Test during yyz business hours.'
      );
      expect(await getLabelsTable().where({ channel_id })).toMatchObject([
        {
          channel_id: 'CHNLIDRND1',
          label_name: 'Product Area: Test',
          offices: ['sfo', 'vie'],
        },
      ]);
    });

    it('should delete notifications for Product Area test for office sfo', async function () {
      const channel_id = channelId(1);
      const command = {
        channel_id,
        text: '-Test sfo',
      };
      await slackHandler({ command, ack, say, respond, client });
      expect(say).lastCalledWith(
        'This channel (test) will no longer get notifications for Product Area: Test during sfo business hours.'
      );
      expect(await getLabelsTable().where({ channel_id })).toMatchObject([
        {
          channel_id: 'CHNLIDRND1',
          label_name: 'Product Area: Test',
          offices: ['vie'],
        },
      ]);
    });

    it('should delete notifications for Product Area test for office vie', async function () {
      const channel_id = channelId(1);
      const command = {
        channel_id,
        text: '-Test vie',
      };
      await slackHandler({ command, ack, say, respond, client });
      expect(say).lastCalledWith(
        'This channel (test) will no longer get notifications for Product Area: Test during vie business hours.'
      );
      expect(await getLabelsTable().where({ channel_id })).toEqual([]);
    });
  });
});

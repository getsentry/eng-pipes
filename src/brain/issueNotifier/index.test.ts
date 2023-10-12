import { hydrateGitHubEventAndPayload } from '@test/utils/github';

import { getLabelsTable, githubLabelHandler } from '.';

import { bolt } from '~/api/slack';
import {
  WAITING_FOR_PRODUCT_OWNER_LABEL,
  WAITING_FOR_SUPPORT_LABEL,
} from '~/config';
import { db } from '~/utils/db';

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
        false,
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
});

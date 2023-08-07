import { buildServer } from '@/buildServer';
import testpayload from '@test/payloads/options-automator/testpayload.json';
import { GETSENTRY_ORG } from '@/config';
import { bolt } from '@api/slack';

describe('options-automator webhook', function() {
    let fastify;
    beforeEach(async function () {
        fastify = await buildServer(false);
    });
  
    afterEach(function () {
      fastify.close();
    });

    it('correctly inserts options-automator webhook when stage starts', async function () {
        const response = await fastify.inject({
          method: 'POST',
          url: '/metrics/options-automator/webhook',
          payload: testpayload,
        });
    
        expect(response.statusCode).toBe(200);
      });
});

describe('test message slack', function() {
    let boltPostMessageSpy;
    const org = GETSENTRY_ORG;

    beforeEach(async function () {
        boltPostMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
    });
  
    afterEach(function () {
      jest.clearAllMocks();
    });

    it('writes to slack', function() {
        const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
        expect(postMessageSpy).toHaveBeenCalledTimes(2);
        expect(postMessageSpy).toHaveBeenCalledWith({
            blocks: [
                {
                    type: "header",
                    text: {
                    type: "plain_text",
                    text: "✅ Successfully Updated Options: ✅"
                    }
                },
                {
                    type: "divider"
                },
                {
                    type: "section",
                    text: {
                    type: "mrkdwn",
                    text: "*Updated options:* "
                    }
                },
                {
                    type: "section",
                    fields: [
                    {
                        type: "mrkdwn",
                        text: "updated `updated_option_1` with db value `db_value_1` and value `new_value_1`"
                    }
                    ]
                },
                {
                    type: "divider"
                },
                {
                    type: "section",
                    text: {
                    type: "mrkdwn",
                    text: "*Set Options:* "
                    }
                },
                {
                    type: "section",
                    fields: [
                    {
                        type: "mrkdwn",
                        text: "Set `set_option_1` with value `set_value_1`"
                    },
                    {
                        type: "mrkdwn",
                        text: "Set `set_option_2` with value `set_value_2`"
                    }
                    ]
                },
                {
                    type: "divider"
                },
                {
                    type: "section",
                    text: {
                    type: "mrkdwn",
                    text: "*Unset Options:* "
                    }
                },
                {
                    type: "section",
                    fields: [
                    {
                        type: "mrkdwn",
                        text: "Unset `unset_option_1`"
                    },
                    {
                        type: "mrkdwn",
                        text: "Unset `unset_option_2`"
                    }
                    ]
                }
                ],
                channel: "C04URUC21C5",
                text: "",
                unfurl_links: false
        });
    })
})

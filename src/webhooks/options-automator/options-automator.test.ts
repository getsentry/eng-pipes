import { buildServer } from '@/buildServer';
import testpayload from '@test/payloads/options-automator/testpayload.json';
import { GETSENTRY_ORG } from '@/config';
import { bolt } from '@api/slack';
import messageSlack from './options-automator';

describe('options-automator webhook', function() {
    let fastify;
    const org = GETSENTRY_ORG;

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
    
    it('writes to slack', async function (){
        const response = await fastify.inject({
            method: 'POST',
            url: '/metrics/options-automator/webhook',
            payload: testpayload,
          });
        
    }) 
});

describe('options-automator message slack', function() {
    let boltPostMessageSpy;
    beforeEach(async function () {
        boltPostMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
    });

    afterEach(async function () {
        jest.clearAllMocks();
    });

    it('should write two messages to slack', async function () {
        const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
        await Promise.all(messageSlack(testpayload));
        expect(postMessageSpy).toHaveBeenCalledTimes(2);
        expect(postMessageSpy).toHaveBeenCalledWith({
            blocks: [
                    {
                        "type": "header",
                        "text": {
                            "type": "plain_text",
                            "text": "✅ Successfully Updated Options: ✅"
                        }
                    },
                    {
                        "type": "divider"
                    },
                    {
                        "type": "section",
                        "text": {
                            "type": "mrkdwn",
                            "text": "*Updated options:* "
                        },
                        "fields": [
                            {
                                "type": "mrkdwn",
                                "text": "updated `updated_option_1` with db value `db_value_1` and value `new_value_1`"
                            }
                        ]
                    },
                    {
                        "type": "divider"
                    },
                    {
                        "type": "section",
                        "text": {
                            "type": "mrkdwn",
                            "text": "*Set Options:* "
                        },
                        "fields": [
                            {
                                "type": "mrkdwn",
                                "text": "Set `set_option_1` with value `set_value_1`"
                            },
                            {
                                "type": "mrkdwn",
                                "text": "Set `set_option_2` with value `set_value_2`"
                            }
                        ]
                    },
                    {
                        "type": "divider"
                    },
                    {
                        "type": "section",
                        "text": {
                            "type": "mrkdwn",
                            "text": "*Unset Options:* "
                        },
                        "fields": [
                            {
                                "type": "mrkdwn",
                                "text": "Unset `unset_option_1`"
                            },
                            {
                                "type": "mrkdwn",
                                "text": "Unset `unset_option_2`"
                            }
                        ]
                    }
        ]});
            
        expect(postMessageSpy).toHaveBeenCalledWith({
            blocks: [
                {
                    "type": "header",
                    "text": {
                        "type": "plain_text",
                        "text": "❌ FAILED TO UPDATE: ❌"
                    }
                },
                {
                    "type": "divider"
                },
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": "*DRIFTED OPTIONS:* "
                    },
                    "fields": [
                        {
                            "type": "mrkdwn",
                            "text": "`drifted_option_1` drifted. value on db: `value_1`"
                        },
                        {
                            "type": "mrkdwn",
                            "text": "`drifted_option_2` drifted. value on db: `value_2`"
                        }
                    ]
                },
                {
                    "type": "divider"
                },
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": "*FAILED:* "
                    },
                    "fields": [
                        {
                            "type": "mrkdwn",
                            "text": "`FAILED TO UPDATE `error_option_1` \nREASON: `Error occurred for option 1`"
                        },
                        {
                            "type": "mrkdwn",
                            "text": "`FAILED TO UPDATE `error_option_2` \nREASON: `Error occurred for option 2`"
                        }
                    ]
                }
            ]
        }
    )    
    });
})

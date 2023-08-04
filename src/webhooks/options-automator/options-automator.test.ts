import { buildServer } from '@/buildServer';

describe('options-automator webhook', function() {
    let fatify;
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
          payload: ,
        });
    
        expect(response.statusCode).toBe(200);
    
        // TODO (mattgauntseo-sentry): Check metric is stored correctly in
        // database
      });
});

import { messageSlack } from './your-webhook-file';
import { OptionsAutomatorResponse } from '@types';
import { bolt } from '@/api/slack';

jest.mock('@/api/slack'); // Mock the Slack client

describe('messageSlack', () => {
  afterEach(() => {
    jest.clearAllMocks(); // Clear mock call records after each test
  });

  it('should send success message to Slack when updates are present', async () => {
    // Mocked data for OptionsAutomatorResponse
    const response: OptionsAutomatorResponse = {
      updated_options: [{ option_name: 'option1', db_value: 'old', value: 'new' }],
      set_options: [],
      unset_options: [],
      drifted_options: [],
      error_options: [],
    };

    // Call the function with the mocked data
    await messageSlack(response);

    // Assert that the bolt.client.chat.postMessage was called with the correct parameters
    expect(bolt.client.chat.postMessage).toHaveBeenCalledWith({
      channel: 'your_slack_channel_id',
      blocks: /* expected success block */,
      text: '',
      unfurl_links: false,
    });

    // Other assertions as needed...
  });

  // Add more test cases to cover other scenarios and error handling
});
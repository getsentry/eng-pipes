import { bolt } from '@api/slack';

import { sendUnregisteredOptionsSummary } from './unregisteredOptionsSummary';

jest.mock('@/utils/db/unregisteredOptions', () => ({
  getUnregisteredOptions: jest.fn(),
}));

import { getUnregisteredOptions } from '@/utils/db/unregisteredOptions';

const mockGetUnregisteredOptions =
  getUnregisteredOptions as jest.MockedFunction<typeof getUnregisteredOptions>;

describe('unregisteredOptionsSummary', function () {
  let postMessageSpy;

  beforeEach(function () {
    postMessageSpy = jest
      .spyOn(bolt.client.chat, 'postMessage')
      .mockImplementation(jest.fn());
  });

  afterEach(function () {
    jest.clearAllMocks();
  });

  it('does not post when there are no unregistered options', async function () {
    mockGetUnregisteredOptions.mockResolvedValue([]);
    await sendUnregisteredOptionsSummary();
    expect(postMessageSpy).toHaveBeenCalledTimes(0);
  });

  it('posts summary with options grouped by name and sorted', async function () {
    mockGetUnregisteredOptions.mockResolvedValue([
      { option_name: 'feature.organizations:beta-flag', region: 'us' },
      { option_name: 'feature.organizations:beta-flag', region: 'de' },
      { option_name: 'feature.organizations:alpha-flag', region: 'us' },
    ]);
    await sendUnregisteredOptionsSummary();
    expect(postMessageSpy).toHaveBeenCalledTimes(1);
    const message = postMessageSpy.mock.calls[0][0];
    expect(message.channel).toBe('C04URUC21C5');
    expect(message.unfurl_links).toBe(false);
    expect(message.text).toBe('Daily summary: 2 unregistered options');

    const blocks = message.blocks;
    // Header
    expect(blocks[0]).toEqual({
      type: 'header',
      text: {
        type: 'plain_text',
        text: 'Daily Unregistered Options Summary',
      },
    });
    // Description section
    expect(blocks[1].type).toBe('section');
    expect(blocks[1].text.text).toContain('2 unregistered option(s)');
    // Divider
    expect(blocks[2].type).toBe('divider');
    // Options section — sorted alphabetically
    expect(blocks[3].type).toBe('section');
    expect(blocks[3].fields).toHaveLength(2);
    expect(blocks[3].fields[0].text).toContain('alpha-flag');
    expect(blocks[3].fields[0].text).toContain('us');
    expect(blocks[3].fields[1].text).toContain('beta-flag');
    expect(blocks[3].fields[1].text).toContain('de, us');
  });
});

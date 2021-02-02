// Add as needed
const web = {
  chat: {
    postMessage: jest.fn(() =>
      // TODO: this is incomplete
      Promise.resolve({
        channel: 'channel_id',
        ts: '1234123.123',
      })
    ),
    update: jest.fn(() => Promise.resolve({})),
  },
};

const slackEvents = jest.requireActual('@api/slack').slackEvents;

export { web, slackEvents };

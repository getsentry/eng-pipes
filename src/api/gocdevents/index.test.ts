import { gocdevents } from '~/src/api/gocdevents';

describe('gocdevents', function () {
  beforeEach(async function () {
    // Ensure each test starts with no listeners
    gocdevents.removeAllListeners();
  });

  afterAll(async function () {
    // Ensure future tests start with no listeners
    gocdevents.removeAllListeners();
  });

  it('emit both star and event type', () => {
    const starSpy = jest.fn();
    const stageSpy = jest.fn();
    const agentSpy = jest.fn();

    gocdevents.on('*', starSpy);
    gocdevents.on('stage', stageSpy);
    gocdevents.on('agent', agentSpy);

    gocdevents.emit('stage', {
      data: {
        pipeline: { name: 'test-name', group: 'test-group' },
      },
    });
    gocdevents.emit('agent', {});

    expect(starSpy).toHaveBeenCalledTimes(2);
    expect(stageSpy).toHaveBeenCalledTimes(1);
    expect(agentSpy).toHaveBeenCalledTimes(1);
  });

  it('do not emit stage when no group is provided', () => {
    const starSpy = jest.fn();
    const stageSpy = jest.fn();

    gocdevents.on('*', starSpy);
    gocdevents.on('stage', stageSpy);

    gocdevents.emit('stage', { data: { pipeline: { name: 'test-name' } } });

    expect(starSpy).toHaveBeenCalledTimes(0);
    expect(stageSpy).toHaveBeenCalledTimes(0);
  });
});

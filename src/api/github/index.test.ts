import { EngPipesOctokit as octokitClass } from '@api/github/engpipesOctokit';
import { makeUserTokenClient } from '@api/github/makeUserTokenClient';

describe('makeUserTokenClient', function () {
  it('is instantiated once', async function () {
    makeUserTokenClient('blah blah');
    expect(octokitClass).toHaveBeenCalledWith({
      auth: 'blah blah',
      throttle: expect.anything(),
    });
  });
  it('throws an error for no token', async function () {
    expect(() => {
      makeUserTokenClient('');
    }).toThrow('No token. Try setting GH_USER_TOKEN.');
  });
});

import { makeUserTokenClient } from '@api/github/makeUserTokenClient';
import { OctokitWithRetries as octokitClass } from '@api/github/octokitWithRetries';

describe('makeUserTokenClient', function () {
  it('is instantiated once', async function () {
    makeUserTokenClient('blah blah');
    expect(octokitClass).toHaveBeenCalledWith({ auth: 'blah blah' });
  });
  it('throws an error for no token', async function () {
    expect(() => {
      makeUserTokenClient('');
    }).toThrow('No token. Try setting GH_USER_TOKEN.');
  });
});

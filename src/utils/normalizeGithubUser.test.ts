import { normalizeGithubUser } from './normalizeGithubUser';

describe('normalizeGithubUser', function () {
  it('does nothing if we have a string w/o protocol/host', function () {
    expect(normalizeGithubUser('githubUser')).toBe('githubUser');
  });

  it('strips off the github URL', function () {
    expect(normalizeGithubUser('https://github.com/githubUser')).toBe(
      'githubUser'
    );
    expect(normalizeGithubUser('http://github.com/githubUser')).toBe(
      'githubUser'
    );
  });

  it('strips off the github hostname (no protocol)', function () {
    expect(normalizeGithubUser('github.com/githubUser')).toBe('githubUser');
  });

  it('returns undefined if called with undefined', function () {
    expect(normalizeGithubUser()).toBeUndefined();
  });
});

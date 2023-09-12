import * as Sentry from '@sentry/node';

import { getTeams } from './getTeams';

// Check tests/product-owners.yml for data used for tests here
describe('getTeams', function () {
  it('should return empty array if no teams were found', () => {
    expect(getTeams('repo-does-not-exist', 'getsentry')).toEqual([]);
  });

  it('should return array with one team if repo does not have routing', () => {
    expect(getTeams('test-ttt-simple', 'getsentry')).toEqual([
      'team-ospo',
    ]);
  });

  it('should return empty array if repo has routing and no product area is passed', () => {
    expect(getTeams('routing-repo', 'getsentry')).toEqual([]);
  });

  it('should return array with one team if repo has routing and product area is owned by one team', () => {
    expect(getTeams('routing-repo', 'getsentry', 'One-Team')).toEqual([
      'team-ospo',
    ]);
  });

  it('should return array with multiple teams if repo has routing and product area is owned by multiple teams', () => {
    expect(getTeams('routing-repo', 'getsentry', 'Multi-Team')).toEqual([
      'team-issues',
      'team-enterprise',
    ]);
  });

  it('should return empty array if org is codecov', () => {
    expect(getTeams('codecov-repo', 'codecov', 'Multi-Team')).toEqual([]);
  });

  it('should return empty array if team is not defined in product owners yml', () => {
    const captureMessageSpy = jest.spyOn(Sentry, 'captureMessage');
    expect(getTeams('undefined-team-repo', 'getsentry', 'Multi-Team')).toEqual(
      []
    );
    expect(captureMessageSpy).toHaveBeenCalledWith(
      'Teams is not defined for getsentry/undefined-team-repo'
    );
  });

  it('should return empty array if product area is not defined in product owners yml', () => {
    const captureMessageSpy = jest.spyOn(Sentry, 'captureMessage');
    expect(
      getTeams('routing-repo', 'getsentry', 'Undefined Product Area',)
    ).toEqual([]);
    expect(captureMessageSpy).toHaveBeenCalledWith(
      'Teams is not defined for Undefined Product Area'
    );
  });
});

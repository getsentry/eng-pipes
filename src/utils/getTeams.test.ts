import * as Sentry from '@sentry/node';

import { getTeams } from './getTeams';

// Check tests/product-owners.yml for data used for tests here
describe('getTeams', function () {
  it('should return empty array if no teams were found', () => {
    expect(getTeams('repo-does-not-exist', undefined, 'getsentry')).toEqual([]);
  });

  it('should return array with one team if repo does not have routing', () => {
    expect(getTeams('test-ttt-simple', undefined, 'getsentry')).toEqual([
      'team-ospo',
    ]);
  });

  it('should return empty array if repo has routing and no product area is passed', () => {
    expect(getTeams('routing-repo', undefined, 'getsentry')).toEqual([]);
  });

  it('should return array with one team if repo has routing and product area is owned by one team', () => {
    expect(getTeams('routing-repo', 'One-Team', 'getsentry')).toEqual([
      'team-ospo',
    ]);
  });

  it('should return array with multiple teams if repo has routing and product area is owned by multiple teams', () => {
    expect(getTeams('routing-repo', 'Multi-Team', 'getsentry')).toEqual([
      'team-issues',
      'team-enterprise',
    ]);
  });

  it('should return empty array if org is codecov', () => {
    expect(getTeams('codecov', 'Multi-Team', 'getsentry')).toEqual([]);
  });

  it('should return empty array if team is not defined in product owners yml', () => {
    const captureMessageSpy = jest.spyOn(Sentry, 'captureMessage');
    expect(getTeams('undefined-team-repo', 'Multi-Team', 'getsentry')).toEqual(
      []
    );
    expect(captureMessageSpy).toHaveBeenCalledWith(
      'Teams is not defined for getsentry/undefined-team-repo'
    );
  });

  it('should return empty array if product area is not defined in product owners yml', () => {
    const captureMessageSpy = jest.spyOn(Sentry, 'captureMessage');
    expect(
      getTeams('routing-repo', 'Undefined Product Area', 'getsentry')
    ).toEqual([]);
    expect(captureMessageSpy).toHaveBeenCalledWith(
      'Teams is not defined for Undefined Product Area'
    );
  });
});

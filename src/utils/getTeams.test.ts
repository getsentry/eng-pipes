import { getTeams } from './getTeams';

describe('getTeams', function () {
  it('should return empty array if no teams were found', () => {
    expect(getTeams('repo-does-not-exist', undefined, 'getsentry')).toEqual([]);
  });

  it('should return array with one team if repo does not have routing', () => {
    expect(getTeams('test-ttt-simple', undefined, 'getsentry')).toEqual(['team-ospo']);
  });

  it('should return empty array if repo has routing and no product area is passed', () => {
    expect(getTeams('routing-repo', undefined, 'getsentry')).toEqual([]);
  });

  it('should return array with one team if repo has routing and product area is owned by one team', () => {
    expect(getTeams('routing-repo', 'One-Team', 'getsentry')).toEqual(['team-ospo']);
  });

  it('should return array with multiple teams if repo has routing and product area is owned by multiple teams', () => {
    expect(getTeams('routing-repo', 'Multi-Team', 'getsentry')).toEqual(['team-issues', 'team-enterprise']);
  });
});

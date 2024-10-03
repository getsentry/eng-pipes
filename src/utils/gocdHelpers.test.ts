import { GoCDPipeline } from '@/types/gocd';
import {
  filterBuildCauses,
  firstGitMaterialSHA,
  getBaseAndHeadCommit,
} from '@/utils/gocdHelpers';
import { getLastGetSentryGoCDDeploy } from '@utils/db/getLatestDeploy';

jest.mock('@utils/db/getLatestDeploy');

describe('firstGitMaterialSHA', () => {
  afterEach(async function () {
    jest.clearAllMocks();
  });

  it('return nothing for no deploy', async function () {
    const got = firstGitMaterialSHA(undefined);
    expect(got).toEqual(null);
  });

  it('return nothing no build materials', async function () {
    const got = firstGitMaterialSHA({
      pipeline_build_cause: [],
    });
    expect(got).toEqual(null);
  });

  it('return nothing for no modifications', async function () {
    const got = firstGitMaterialSHA({
      pipeline_build_cause: [
        {
          changed: true,
          material: {
            type: 'git',
            'git-configuration': {
              'shallow-clone': false,
              branch: 'master',
              url: 'https://example.com/repo.git',
            },
          },
          modifications: [],
        },
      ],
    });
    expect(got).toEqual(null);
  });

  it('return null for non-git material sha', async function () {
    const got = firstGitMaterialSHA({
      pipeline_build_cause: [
        {
          changed: true,
          material: {
            type: 'pipeline',
          },
          modifications: [
            {
              revision: 'example-pipeline/1/example-stage',
              'modified-time': '2021-01-01T00:00:00Z',
            },
          ],
        },
      ],
    });
    expect(got).toEqual(null);
  });

  it('return first material sha', async function () {
    const got = firstGitMaterialSHA({
      pipeline_build_cause: [
        {
          changed: true,
          material: {
            type: 'git',
            'git-configuration': {
              'shallow-clone': false,
              branch: 'master',
              url: 'https://example.com/repo.git',
            },
          },
          modifications: [
            {
              revision: 'abc123',
              'modified-time': '2021-01-01T00:00:00Z',
            },
          ],
        },
      ],
    });
    expect(got).toEqual('abc123');
  });
});

describe('filterBuildCauses', () => {
  it('filter build causes', function () {
    const pipeline: Pick<GoCDPipeline, 'build-cause'> = {
      'build-cause': [
        {
          changed: true,
          material: {
            type: 'git',
            'git-configuration': {
              'shallow-clone': false,
              branch: 'master',
              url: 'https://example.com/repo.git',
            },
          },
          modifications: [
            {
              revision: 'abc123',
              'modified-time': '2021-01-01T00:00:00Z',
            },
          ],
        },
        {
          changed: true,
          material: {
            type: 'git',
            'git-configuration': {
              'shallow-clone': false,
              branch: 'master',
              url: 'https://example.com/repo.git',
            },
          },
          modifications: [],
        },
        {
          changed: true,
          material: {
            type: 'pipeline',
          },
          modifications: [
            {
              revision: 'example-pipeline-name/123/pipeline-complete/1',
              'modified-time': '2021-01-01T00:00:00Z',
            },
          ],
        },
        {
          changed: true,
          material: {
            type: 'pipeline',
          },
          modifications: [],
        },
      ],
    };

    const expectedGit = [pipeline['build-cause'][0]];

    const gotGit = filterBuildCauses(pipeline, 'git');
    expect(gotGit).toEqual(expectedGit);

    const expectedPipeline = [pipeline['build-cause'][2]];

    const gotPipeline = filterBuildCauses(pipeline, 'pipeline');
    expect(gotPipeline).toEqual(expectedPipeline);
  });

  describe('getBaseAndHeadCommit', () => {
    it('return nothing when there is no build cause', async function () {
      const got = await getBaseAndHeadCommit({
        'build-cause': [],
        group: 'example-pipeline-group',
        name: 'example-pipeline-name',
      });
      expect(got).toEqual([null, null]);
    });

    it('return nothing when there is no git build cause', async function () {
      const got = await getBaseAndHeadCommit({
        group: 'example-pipeline-group',
        name: 'example-pipeline-name',
        'build-cause': [
          {
            changed: true,
            material: {
              type: 'pipeline',
            },
            modifications: [],
          },
        ],
      });
      expect(got).toEqual([null, null]);
    });

    it('return nothing when there is no modifications', async function () {
      const got = await getBaseAndHeadCommit({
        group: 'example-pipeline-group',
        name: 'example-pipeline-name',
        'build-cause': [
          {
            changed: true,
            material: {
              type: 'git',
              'git-configuration': {
                'shallow-clone': false,
                branch: 'master',
                url: 'https://example.com/repo.git',
              },
            },
            modifications: [],
          },
        ],
      });
      expect(got).toEqual([null, null]);
    });

    it('return just head commit when there is no deploy', async function () {
      // @ts-ignore
      getLastGetSentryGoCDDeploy.mockReturnValue(null);

      const got = await getBaseAndHeadCommit({
        group: 'example-pipeline-group',
        name: 'example-pipeline-name',
        'build-cause': [
          {
            changed: true,
            material: {
              type: 'git',
              'git-configuration': {
                'shallow-clone': false,
                branch: 'master',
                url: 'https://example.com/repo.git',
              },
            },
            modifications: [
              {
                revision: 'abc123',
                'modified-time': '2021-01-01T00:00:00Z',
              },
            ],
          },
        ],
      });

      expect(got).toEqual([null, 'abc123']);
    });

    it('return base and head commit when there is a deploy', async function () {
      const mockReturnValue = {
        pipeline_build_cause: [
          {
            material: {
              type: 'git',
            },
            modifications: [
              {
                revision: 'def456',
              },
            ],
          },
        ],
      };
      // @ts-ignore
      getLastGetSentryGoCDDeploy.mockReturnValue(mockReturnValue);

      const got = await getBaseAndHeadCommit({
        group: 'example-pipeline-group',
        name: 'example-pipeline-name',
        'build-cause': [
          {
            changed: true,
            material: {
              type: 'git',
              'git-configuration': {
                branch: 'master',
                'shallow-clone': false,
                url: 'https://example.com/repo.git',
              },
            },
            modifications: [
              {
                revision: 'abc123',
                'modified-time': '2021-01-01T00:00:00Z',
              },
            ],
          },
        ],
      });

      expect(got).toEqual(['def456', 'abc123']);
    });
  });
});

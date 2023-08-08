import { filterBuildCauses, firstGitMaterialSHA } from '@/utils/gocdHelpers';

describe('firstGitMaterialSHA', () => {
  it('return nothing for no deploy', async function () {
    const got = firstGitMaterialSHA(null);
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
          material: {
            type: 'git',
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
          material: {
            type: 'other',
          },
          modifications: [
            {
              revision: 'example-pipeline/1/example-stage',
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
          material: {
            type: 'git',
          },
          modifications: [
            {
              revision: 'abc123',
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
    const pipeline = {
      'build-cause': [
        {
          id: 1,
          material: {
            type: 'git',
          },
          modifications: [{}],
        },
        {
          id: 2,
          material: {
            type: 'git',
          },
          modifications: [],
        },
        {
          id: 3,
          material: {
            type: 'pipeline',
          },
          modifications: [{}],
        },
        {
          id: 4,
          material: {
            type: 'pipeline',
          },
          modifications: [],
        },
      ],
    };

    const gotGit = filterBuildCauses(pipeline, 'git');
    expect(gotGit.length).toEqual(1);
    expect(gotGit).toEqual([
      {
        id: 1,
        material: {
          type: 'git',
        },
        modifications: [{}],
      },
    ]);

    const gotPipeline = filterBuildCauses(pipeline, 'pipeline');
    expect(gotPipeline.length).toEqual(1);
    expect(gotPipeline).toEqual([
      {
        id: 3,
        material: {
          type: 'pipeline',
        },
        modifications: [{}],
      },
    ]);
  });
});

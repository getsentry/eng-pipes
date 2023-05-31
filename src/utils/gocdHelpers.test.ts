import { firstMaterialSHA } from '../utils/gocdHelpers';

describe('firstMaterialSHA', () => {
  it('return nothing for no deploy', async function () {
    const got = firstMaterialSHA(null);
    expect(got).toEqual(null);
  });

  it('return nothing no build materials', async function () {
    const got = firstMaterialSHA({
      pipeline_build_cause: [],
    });
    expect(got).toEqual(null);
  });

  it('return nothing no modifications', async function () {
    const got = firstMaterialSHA({
      pipeline_build_cause: [
        {
          modifications: [],
        },
      ],
    });
    expect(got).toEqual(null);
  });

  it('return first material sha', async function () {
    const got = firstMaterialSHA({
      pipeline_build_cause: [
        {
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

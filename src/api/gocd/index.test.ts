import { GOCD_ORIGIN, GOCD_TOKEN } from '@/config';
import { GoCDDashboardResponse } from '@/types/gocd';
import * as iap from '@/utils/iap';

import { fetchDashboard, removeNestedEmbeddings } from './index';

describe('gocd', () => {
  let fetchUsingProxyAuthSpy: jest.SpyInstance;

  beforeAll(() => {
    fetchUsingProxyAuthSpy = jest.spyOn(iap, 'fetchUsingProxyAuth');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('removes nested embeddings for multiple nested keys', () => {
    const data = {
      _embedded: {
        key1: [{ name: 'value1' }, { name: 'value2' }],
        key2: [{ name: 'value3' }, { name: 'value4' }],
      },
    };
    const expected = {
      key1: [{ name: 'value1' }, { name: 'value2' }],
      key2: [{ name: 'value3' }, { name: 'value4' }],
    };
    expect(removeNestedEmbeddings(data)).toEqual(expected);
  });

  it('removes nested embeddings for a single nested key', () => {
    const data = {
      _embedded: {
        key: [{ name: 'value' }],
      },
    };
    const expected = {
      key: [{ name: 'value' }],
    };
    expect(removeNestedEmbeddings(data)).toEqual(expected);
  });

  it('removes nested embeddings for a nested key with multiple values', () => {
    const data = {
      _embedded: {
        key: [{ name: 'value1' }, { name: 'value2' }],
      },
    };
    const expected = {
      key: [{ name: 'value1' }, { name: 'value2' }],
    };
    expect(removeNestedEmbeddings(data)).toEqual(expected);
  });

  it('removes nested embeddings from an array', () => {
    const data = [
      {
        _embedded: {
          key: [{ name: 'value1' }, { name: 'value2' }],
        },
      },
      {
        _embedded: {
          key: [{ name: 'value3' }, { name: 'value4' }],
        },
      },
    ];
    const expected = [
      {
        key: [{ name: 'value1' }, { name: 'value2' }],
      },
      {
        key: [{ name: 'value3' }, { name: 'value4' }],
      },
    ];
    expect(removeNestedEmbeddings(data)).toEqual(expected);
  });

  it('removes nested embeddings from a nested object', () => {
    const data = {
      key: {
        _embedded: {
          key: [{ name: 'value' }],
        },
      },
    };
    const expected = {
      key: {
        key: [{ name: 'value' }],
      },
    };
    expect(removeNestedEmbeddings(data)).toEqual(expected);
  });

  it('handles json with no nested embeddings', () => {
    const data = {
      key: 'value',
    };
    expect(removeNestedEmbeddings(data)).toEqual(data);
  });

  it('handles nested primitives', () => {
    const data = {
      _embedded: {
        key: [],
      },
      nested: {
        key: 'value',
      },
    };
    const expected = {
      key: [],
      nested: {
        key: 'value',
      },
    };
    expect(removeNestedEmbeddings(data)).toEqual(expected);
  });

  it('handles primitives', () => {
    const data = 'value';
    expect(removeNestedEmbeddings(data)).toEqual(data);
  });

  it('fetches the GoCD dashboard', async () => {
    fetchUsingProxyAuthSpy.mockReturnValue(
      Promise.resolve({
        data: {
          _embedded: {
            pipeline_groups: [],
            pipelines: [],
          },
        },
      })
    );

    const mockResponse: GoCDDashboardResponse = {
      pipelines: [],
      pipeline_groups: [],
    };

    const response = await fetchDashboard();

    expect(fetchUsingProxyAuthSpy).toHaveBeenCalledWith(
      `${GOCD_ORIGIN}/go/api/dashboard`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/vnd.go.cd.v4+json',
          Authorization: `Bearer ${GOCD_TOKEN}`,
        },
      }
    );
    expect(response).toEqual(mockResponse);
  });
});

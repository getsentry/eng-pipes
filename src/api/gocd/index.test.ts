import fetch, { Headers } from 'node-fetch';

import { GOCD_ORIGIN } from '@/config';
import { GoCDDashboardResponse } from '@/types';
import * as iap from '@/utils/iap';

import { fetchDashboard, removeNestedEmbeddings } from './index';

describe('gocd', () => {
  let iapSpy: jest.SpyInstance;
  beforeEach(() => {
    iapSpy = jest.spyOn(iap, 'getIDToken');
    iapSpy.mockReturnValue('fake-token');
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

  it('fetches the GoCD dashboard', async () => {
    const mockResponse: GoCDDashboardResponse = {
      pipelines: [],
    };

    jest.spyOn(fetch, 'default').mockResolvedValue({
      json: jest.fn().mockResolvedValue(mockResponse),
    });

    const response = await fetchDashboard();

    const headers = new Headers();
    headers.set('Authorization', 'Bearer fake-token');
    headers.set('Proxy-Authorization', 'fake-token');
    headers.set('Accept', 'application/vnd.go.cd.v4+json');

    expect(fetch).toHaveBeenCalledWith(`${GOCD_ORIGIN}/go/api/dashboard`, {
      method: 'GET',
      headers,
    });
    expect(response).toEqual(mockResponse);
  });
});

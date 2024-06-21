import { GOCD_ORIGIN } from '@/config';
import { GoCDDashboardResponse } from '@/types';
import { fetchUsingProxyAuth, RequestOptions } from '@utils/iap';

/**
 * The GoCD API returns a lot of data nested under `_embedded` keys.
 * This function removes the `_embedded` key and moves its value up one level.
 * Note: embedded keys always contain an object with a single key, whose value is an array.
 * @param data the data returned from the GoCD API
 * @returns the data with the `_embedded` key(s) removed
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function removeNestedEmbeddings(data: any): any {
  if (Array.isArray(data)) {
    return data.map(removeNestedEmbeddings);
  } else if (typeof data === 'object') {
    const result: any = {};
    for (const key in data) {
      if (key === '_embedded') {
        for (const newKey in data[key]) {
          result[newKey] = data[key][newKey].map(removeNestedEmbeddings);
        }
      } else if (typeof data[key] === 'object') {
        result[key] = removeNestedEmbeddings(data[key]);
      } else {
        result[key] = data[key];
      }
    }
    return result;
  } else {
    return data;
  }
}

async function gocdFetch<T>(
  urlSuffix: string,
  opts: RequestOptions
): Promise<T> {
  const fullURL = `${GOCD_ORIGIN}${urlSuffix}`;
  opts.headers = {
    Authorization: `Bearer ${process.env.GOCD_TOKEN}`,
    ...opts.headers,
  };

  const resp = await fetchUsingProxyAuth(fullURL, opts);
  const json = JSON.parse(resp.data);
  return removeNestedEmbeddings(json) as T;
}

export async function fetchDashboard() {
  return gocdFetch<GoCDDashboardResponse>('/go/api/dashboard', {
    method: 'GET',
    headers: {
      Accept: 'application/vnd.go.cd.v4+json',
    },
  });
}

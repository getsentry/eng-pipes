import { gaxios, GoogleAuth } from 'google-auth-library';

import { IAP_TARGET_AUDIENCE } from '@/config';

export type RequestMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export type RequestOptions = {
  method: RequestMethod;
  headers: Record<string, string>;
  body?: string;
};

export type ResponseData = {
  status: number;
  headers: Record<string, string>;
  data: string;
};

const auth = new GoogleAuth();

async function getIDToken(): Promise<string> {
  const client = await auth.getIdTokenClient(IAP_TARGET_AUDIENCE);
  const headers = await client.getRequestHeaders();
  return headers['Authorization'];
}

export async function fetchUsingProxyAuth(
  url: string,
  opts: RequestOptions
): Promise<ResponseData> {
  const idToken = await getIDToken();
  const gaxiosInstance = new gaxios.Gaxios({
    headers: {
      'Proxy-Authorization': idToken,
      ...opts.headers,
    },
  });
  return gaxiosInstance.request({
    url,
    responseType: 'json',
    retry: true,
    retryConfig: {
      retry: 3,
      retryDelay: 1000,
    },
    timeout: 10000,
    ...opts,
  });
}

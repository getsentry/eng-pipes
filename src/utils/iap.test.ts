import { GoogleAuth, IdTokenClient } from 'google-auth-library';

import { GOCD_TOKEN, IAP_TARGET_AUDIENCE } from '@/config';

import { fetchUsingProxyAuth } from './iap';

describe('iap', () => {
  it('fetches using proxy auth', async () => {
    const mockGetRequestHeaders = jest.fn().mockResolvedValue({
      Authorization: `Bearer ${GOCD_TOKEN}`,
    });
    const mockGetIdTokenClient = jest.fn().mockResolvedValue({
      getRequestHeaders: mockGetRequestHeaders,
    } as unknown as IdTokenClient);
    const getIdTokenSpy = jest
      .spyOn(GoogleAuth.prototype, 'getIdTokenClient')
      .mockImplementation(mockGetIdTokenClient);

    await fetchUsingProxyAuth('https://example.com', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${GOCD_TOKEN}`,
      },
    });

    expect(getIdTokenSpy).toHaveBeenCalledWith(IAP_TARGET_AUDIENCE);
  });
});

import { getIDToken } from './iap';

jest.mock('google-auth-library', () => ({
  GoogleAuth: jest.fn().mockImplementation(() => ({
    getIdTokenClient: jest.fn().mockResolvedValue({
      getRequestHeaders: jest.fn().mockResolvedValue({
        Authorization: 'Bearer fake-token',
      }),
    }),
  })),
}));

describe('iap', () => {
  it('returns the ID token', async () => {
    const token = await getIDToken();
    expect(token).toEqual('Bearer fake-token');
  });
});

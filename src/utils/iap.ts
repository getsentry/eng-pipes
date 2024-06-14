import { GoogleAuth } from 'google-auth-library';

import { IAP_TARGET_AUDIENCE } from '@/config';

const auth = new GoogleAuth();

export async function getIDToken(): Promise<string> {
  const client = await auth.getIdTokenClient(IAP_TARGET_AUDIENCE);
  const headers = await client.getRequestHeaders();
  return headers['Authorization'];
}

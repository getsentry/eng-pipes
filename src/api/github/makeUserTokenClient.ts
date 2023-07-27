import { OctokitWithRetries } from './octokitWithRetries';

export function makeUserTokenClient(token: string) {
  if (!token) {
    throw new Error('No token. Try setting GH_USER_TOKEN.');
  }
  return new OctokitWithRetries({ auth: token });
}

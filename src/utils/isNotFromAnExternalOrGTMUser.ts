import { getOssUserType } from '~/utils/getOssUserType';

export async function isNotFromAnExternalOrGTMUser(payload: object) {
  const type = await getOssUserType(payload);
  return !(type === 'external' || type === 'gtm');
}

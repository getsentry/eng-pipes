import { getOssUserType } from '@utils/getOssUserType';

export async function isFromOutsideCollaborator(payload) {
  const type = await getOssUserType(payload);
  // Need to check user type to make sure issues created by GTM are routed/triaged
  return type === 'external' && payload.author_association === 'COLLABORATOR';
}

import { getOssUserType } from '../../utils/getOssUserType';

// Validation Helpers

export async function shouldSkip(payload, reasonsToSkip) {
  // Could do Promise-based async here, but that was getting complicated[1] and
  // there's not really a performance concern (famous last words).
  //
  // [1] https://github.com/getsentry/eng-pipes/pull/212#discussion_r657365585

  for (const skipIf of reasonsToSkip) {
    if (await skipIf(payload)) {
      return true;
    }
  }
  return false;
}

export async function isNotFromAnExternalOrGTMUser(payload) {
  const type = await getOssUserType(payload);
  return !(type === 'external' || type === 'gtm');
}

export function slugizeProductArea(s) {
  // Keep this in sync with slugize in ...
  // https://github.com/getsentry/security-as-code/blob/main/rbac/lib/make-product-owners
  // Good luck!
  const slug = s
    .replace(/-/g, ' ')
    .replace(/&/g, ' ')
    .replace(/ +/g, '-')
    .replace(/'/g, '')
    .toLowerCase();
  if (!/^[a-z][a-z-]+[a-z]$/.test(slug)) {
    throw 'Bad slug: ' + slug;
  }
  return slug;
}

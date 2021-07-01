export class MockOctokitError extends Error {
  constructor(status, ...params) {
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error#es6_custom_error_class
    super(...params);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, MockOctokitError);
    }
    this.status = status;
  }
}

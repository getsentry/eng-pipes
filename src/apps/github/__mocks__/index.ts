/**
 * We need to mock these so that we do not have multiple apps that listen
 * to the same github events.
 *
 * Otherwise, during testing, each listener to will respond
 */
export function createGithub(server, opts, done) {
  done();
}

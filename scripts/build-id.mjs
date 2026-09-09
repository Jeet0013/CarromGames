/**
 * A stamp identifying the build itself, rather than the release version.
 *
 * Shared by both builds — the served one and the single-file one — because a
 * stamp that only half the artifacts carry answers the question it exists for
 * only half the time.
 *
 * Testing happens on a phone, at the far end of a share link, and the first
 * thing worth establishing about any bug report is which build is actually
 * running there.
 */
export function buildId() {
  return new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, 'Z')
    .replace('T', '-');
}

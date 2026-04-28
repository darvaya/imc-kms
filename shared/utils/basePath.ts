/**
 * Returns the path component of a URL with the trailing slash stripped.
 * Returns "" when the URL is empty/undefined or has no path component.
 *
 * Examples:
 *   parseBasePath(undefined)                 -> ""
 *   parseBasePath("")                        -> ""
 *   parseBasePath("https://host")            -> ""
 *   parseBasePath("https://host/")           -> ""
 *   parseBasePath("https://host/kms")        -> "/kms"
 *   parseBasePath("https://host/kms/")       -> "/kms"
 *   parseBasePath("http://host:3000/a/b")    -> "/a/b"
 *   parseBasePath("http://host:3000/a/b/")   -> "/a/b"
 */
export function parseBasePath(url: string | undefined): string {
  if (!url) {
    return "";
  }
  const { pathname } = new URL(url);
  return pathname === "/" ? "" : pathname.replace(/\/$/, "");
}

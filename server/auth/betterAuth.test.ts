import { resolveBetterAuthBase } from "./betterAuth";

describe("resolveBetterAuthBase", () => {
  it("folds a sub-path into basePath and keeps baseURL origin-only", () => {
    const { baseURL, basePath } = resolveBetterAuthBase(
      "https://appstpcid.imcpelitalog.com/kms",
      "/kms"
    );
    expect(baseURL).toBe("https://appstpcid.imcpelitalog.com");
    expect(basePath).toBe("/kms/api/better-auth");
  });

  it("keeps baseURL path-less so better-auth does not drop basePath", () => {
    // Regression guard for the `/kms` 404: better-auth's `withPath()` ignores
    // `basePath` whenever `baseURL` carries a path. If baseURL ever regains a
    // path, better-auth would serve at `${path}/*` instead of
    // `${path}/api/better-auth/*` and every auth request would 404.
    const { baseURL } = resolveBetterAuthBase(
      "https://appstpcid.imcpelitalog.com/kms",
      "/kms"
    );
    expect(new URL(baseURL).pathname).toBe("/");
  });

  it("handles a root-origin deploy with empty BASE_PATH", () => {
    const { baseURL, basePath } = resolveBetterAuthBase(
      "https://kb.example.com",
      ""
    );
    expect(baseURL).toBe("https://kb.example.com");
    expect(basePath).toBe("/api/better-auth");
  });

  it("effective serving base equals origin + BASE_PATH + /api/better-auth", () => {
    const url = "https://appstpcid.imcpelitalog.com/kms";
    const { baseURL, basePath } = resolveBetterAuthBase(url, "/kms");
    // This is the path the whole app (frontend fetch, betterAuthHandler,
    // Entra redirect URI) is wired around.
    expect(`${baseURL}${basePath}`).toBe(
      "https://appstpcid.imcpelitalog.com/kms/api/better-auth"
    );
  });
});

jest.mock("@server/auth/betterAuth", () => ({
  getBetterAuth: jest.fn(),
}));

import { getBetterAuth } from "@server/auth/betterAuth";
import env from "@server/env";
import { CSRF } from "@shared/constants";
import { bundleToken, generateRawToken } from "@server/utils/csrf";
import { buildUser } from "@server/test/factories";
import { getSubpathTestServer, getTestServer } from "@server/test/support";

const mockedGetBetterAuth = jest.mocked(getBetterAuth);

afterEach(() => {
  mockedGetBetterAuth.mockReset();
});

describe("sub-path foundation — path-less URL", () => {
  const server = getTestServer();

  it("returns 200 from /_health at the outer root", async () => {
    const res = await server.get("/_health");
    expect(res.status).toBe(200);
  });

  it("routes POST /api/auth.info to the API handler", async () => {
    const user = await buildUser();
    const res = await server.post("/api/auth.info", {
      body: { token: user.sessionToken },
    });
    expect(res.status).toBe(200);
  });

  it("intercepts /api/better-auth/* via betterAuthHandler", async () => {
    mockedGetBetterAuth.mockRejectedValueOnce(
      new Error("MOCK_BETTER_AUTH_INVOKED")
    );
    const res = await server.get("/api/better-auth/sign-in");
    // Reaching the handler proves interception; the throw inside causes 500.
    expect(mockedGetBetterAuth).toHaveBeenCalled();
    expect(res.status).toBe(500);
  });

  describe("CSRF round-trip on a write-scoped endpoint", () => {
    it("rejects POST with cookie-transport auth and no CSRF token", async () => {
      const user = await buildUser();
      const res = await server.post("/api/auth.delete", {
        headers: {
          Cookie: `accessToken=${user.sessionToken}`,
        },
      });
      const body = await res.json();
      expect(res.status).toBe(403);
      expect(body.error).toBe("csrf_error");
    });

    it("succeeds with cookie-transport auth and matching CSRF cookie + header", async () => {
      const user = await buildUser();
      const csrfToken = bundleToken(generateRawToken(16), env.SECRET_KEY);
      const res = await server.post("/api/auth.delete", {
        headers: {
          Cookie: `accessToken=${user.sessionToken}; ${CSRF.cookieName}=${csrfToken}`,
          [CSRF.headerName]: csrfToken,
        },
      });
      expect(res.status).toBe(200);
    });
  });
});

describe("sub-path foundation — URL with /kms prefix", () => {
  const server = getSubpathTestServer("/kms");

  it("returns 200 from /_health at the outer root regardless of BASE_PATH", async () => {
    const res = await server.get("/_health");
    expect(res.status).toBe(200);
  });

  it("returns 404 for POST /api/auth.info because routes are now under /kms", async () => {
    const res = await server.post("/api/auth.info");
    expect(res.status).toBe(404);
  });

  it("routes POST /kms/api/auth.info to the API handler", async () => {
    const user = await buildUser();
    const res = await server.post("/kms/api/auth.info", {
      body: { token: user.sessionToken },
    });
    expect(res.status).toBe(200);
  });

  it("intercepts /kms/api/better-auth/* via betterAuthHandler", async () => {
    mockedGetBetterAuth.mockRejectedValueOnce(
      new Error("MOCK_BETTER_AUTH_INVOKED")
    );
    const res = await server.get("/kms/api/better-auth/sign-in");
    expect(mockedGetBetterAuth).toHaveBeenCalled();
    expect(res.status).toBe(500);
  });

  describe("CSRF round-trip on a write-scoped endpoint under sub-path", () => {
    it("rejects POST with cookie-transport auth and no CSRF token", async () => {
      const user = await buildUser();
      const res = await server.post("/kms/api/auth.delete", {
        headers: {
          Cookie: `accessToken=${user.sessionToken}`,
        },
      });
      const body = await res.json();
      expect(res.status).toBe(403);
      expect(body.error).toBe("csrf_error");
    });

    it("succeeds with cookie-transport auth and matching CSRF cookie + header", async () => {
      const user = await buildUser();
      const csrfToken = bundleToken(generateRawToken(16), env.SECRET_KEY);
      const res = await server.post("/kms/api/auth.delete", {
        headers: {
          Cookie: `accessToken=${user.sessionToken}; ${CSRF.cookieName}=${csrfToken}`,
          [CSRF.headerName]: csrfToken,
        },
      });
      expect(res.status).toBe(200);
    });
  });
});

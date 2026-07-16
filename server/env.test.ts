import env from "./env";

describe("env.BASE_PATH", () => {
  let originalUrl: string;

  beforeAll(() => {
    originalUrl = env.URL;
  });

  afterAll(() => {
    env.URL = originalUrl;
  });

  it("returns empty string when URL has no path", () => {
    env.URL = "https://app.outline.dev";
    expect(env.BASE_PATH).toBe("");
  });

  it("returns empty string when URL has only trailing slash", () => {
    env.URL = "https://app.outline.dev/";
    expect(env.BASE_PATH).toBe("");
  });

  it("returns single segment with leading slash", () => {
    env.URL = "https://app.outline.dev/kms";
    expect(env.BASE_PATH).toBe("/kms");
  });

  it("strips trailing slash from single-segment path", () => {
    env.URL = "https://app.outline.dev/kms/";
    expect(env.BASE_PATH).toBe("/kms");
  });

  it("preserves multi-segment paths", () => {
    env.URL = "http://localhost:3000/kms/nested";
    expect(env.BASE_PATH).toBe("/kms/nested");
  });

  it("strips trailing slash from multi-segment paths", () => {
    env.URL = "http://localhost:3000/kms/nested/";
    expect(env.BASE_PATH).toBe("/kms/nested");
  });

  it("preserves a port + path combination", () => {
    env.URL = "http://host:4800/kms";
    expect(env.BASE_PATH).toBe("/kms");
  });

  it("returns empty string when URL is empty", () => {
    env.URL = "";
    expect(env.BASE_PATH).toBe("");
  });
});

describe("env.MICROSOFT_SSO_ENABLED", () => {
  let originalId: string | undefined;
  let originalSecret: string | undefined;

  beforeAll(() => {
    originalId = env.MICROSOFT_CLIENT_ID;
    originalSecret = env.MICROSOFT_CLIENT_SECRET;
  });

  afterAll(() => {
    env.MICROSOFT_CLIENT_ID = originalId;
    env.MICROSOFT_CLIENT_SECRET = originalSecret;
  });

  // This getter is the single gate that decides the login mode (Microsoft-only
  // vs email/password credentials). It must require BOTH vars so the three call
  // sites (better-auth config, auth.config, seed) can never drift — a partial
  // config must not fall into an ambiguous half-configured state.
  it("is true only when BOTH client id and secret are set", () => {
    env.MICROSOFT_CLIENT_ID = "client-id";
    env.MICROSOFT_CLIENT_SECRET = "client-secret";
    expect(env.MICROSOFT_SSO_ENABLED).toBe(true);
  });

  it("is false when both are unset (credentials-login mode)", () => {
    env.MICROSOFT_CLIENT_ID = undefined;
    env.MICROSOFT_CLIENT_SECRET = undefined;
    expect(env.MICROSOFT_SSO_ENABLED).toBe(false);
  });

  it("is false when only the client id is set (partial config fails closed)", () => {
    env.MICROSOFT_CLIENT_ID = "client-id";
    env.MICROSOFT_CLIENT_SECRET = undefined;
    expect(env.MICROSOFT_SSO_ENABLED).toBe(false);
  });

  it("is false when only the client secret is set", () => {
    env.MICROSOFT_CLIENT_ID = undefined;
    env.MICROSOFT_CLIENT_SECRET = "client-secret";
    expect(env.MICROSOFT_SSO_ENABLED).toBe(false);
  });
});

describe("env.public", () => {
  it("includes BASE_PATH so it reaches window.env on the client", async () => {
    // PublicEnvironmentRegister.registerEnv() schedules its first read of
    // @Public-decorated keys via process.nextTick (see
    // server/utils/decorators/Public.ts). Synchronously after construction,
    // env.public is still empty — flush the tick before asserting.
    await new Promise<void>((resolve) => process.nextTick(resolve));
    expect(env.public).toHaveProperty("BASE_PATH");
  });
});

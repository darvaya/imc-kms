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
    env.URL = "http://host:3100/kms";
    expect(env.BASE_PATH).toBe("/kms");
  });

  it("returns empty string when URL is empty", () => {
    env.URL = "";
    expect(env.BASE_PATH).toBe("");
  });
});

describe("env.public", () => {
  it("includes BASE_PATH so it reaches window.env on the client", () => {
    expect(env.public).toHaveProperty("BASE_PATH");
  });
});

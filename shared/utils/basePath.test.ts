import { parseBasePath } from "./basePath";

describe("parseBasePath", () => {
  it("returns empty string for undefined input", () => {
    expect(parseBasePath(undefined)).toBe("");
  });

  it("returns empty string for empty input", () => {
    expect(parseBasePath("")).toBe("");
  });

  it("returns empty string when URL has no path", () => {
    expect(parseBasePath("https://host")).toBe("");
  });

  it("returns empty string when URL has only trailing slash", () => {
    expect(parseBasePath("https://host/")).toBe("");
  });

  it("returns single segment with leading slash", () => {
    expect(parseBasePath("https://host/kms")).toBe("/kms");
  });

  it("strips trailing slash from single-segment path", () => {
    expect(parseBasePath("https://host/kms/")).toBe("/kms");
  });

  it("preserves multi-segment paths", () => {
    expect(parseBasePath("http://host:3000/a/b")).toBe("/a/b");
  });

  it("strips trailing slash from multi-segment paths", () => {
    expect(parseBasePath("http://host:3000/a/b/")).toBe("/a/b");
  });
});

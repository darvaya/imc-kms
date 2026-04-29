import env from "~/env";
import { getRealtimePath } from "./getRealtimePath";

describe("getRealtimePath", () => {
  let originalBasePath: string | undefined;

  beforeEach(() => {
    originalBasePath = env.BASE_PATH;
  });

  afterEach(() => {
    env.BASE_PATH = originalBasePath;
  });

  it("returns '/realtime' when BASE_PATH is empty", () => {
    env.BASE_PATH = "";
    expect(getRealtimePath()).toBe("/realtime");
  });

  it("returns '/kms/realtime' when BASE_PATH is '/kms'", () => {
    env.BASE_PATH = "/kms";
    expect(getRealtimePath()).toBe("/kms/realtime");
  });

  it("preserves multi-segment BASE_PATH", () => {
    env.BASE_PATH = "/kms/nested";
    expect(getRealtimePath()).toBe("/kms/nested/realtime");
  });

  it("falls back to '/realtime' when BASE_PATH is undefined", () => {
    env.BASE_PATH = undefined;
    expect(getRealtimePath()).toBe("/realtime");
  });
});

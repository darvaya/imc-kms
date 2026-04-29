import http from "http";
import { Duplex } from "stream";
import type Koa from "koa";
import sharedEnv from "@shared/env";
import env from "@server/env";

const mockIoHandleUpgrade = jest.fn();
const mockIoServerCtorArgs: {
  server: http.Server;
  opts: { path: string };
}[] = [];

jest.mock("socket.io", () => {
  function MockServer(server: http.Server, opts: { path: string }) {
    mockIoServerCtorArgs.push({ server, opts });
    // Match the production engine.io behaviour: register an upgrade listener
    // on the http.Server. The tested code (websockets.ts) pops this listener
    // and stores it as `mockIoHandleUpgrade`, then re-registers a wrapping handler.
    server.on("upgrade", mockIoHandleUpgrade);
    return {
      adapter: jest.fn(),
      of: () => ({ adapter: { on: jest.fn() } }),
      on: jest.fn(),
      engine: { clientsCount: 0 },
    };
  }
  return {
    __esModule: true,
    default: { Server: MockServer },
    Server: MockServer,
  };
});

jest.mock("socket.io-redis", () => ({
  createAdapter: jest.fn(() => () => undefined),
}));

jest.mock("@server/queues", () => ({
  websocketQueue: jest.fn(() => ({
    process: jest.fn().mockResolvedValue(undefined),
  })),
}));

import init from "./websockets";

class MockSocket extends Duplex {
  public ended: string | undefined;
  override _read(): void {
    /* no-op */
  }
  override _write(_chunk: unknown, _enc: string, cb: () => void): void {
    cb();
  }
  override end(data?: unknown): this {
    this.ended = typeof data === "string" ? data : "";
    return this;
  }
}

function makeStubKoa(): Koa {
  return {} as Koa;
}

function emitUpgrade(
  server: http.Server,
  url: string,
  origin?: string
): MockSocket {
  const req = {
    url,
    headers: origin ? { origin } : {},
  } as unknown as http.IncomingMessage;
  const socket = new MockSocket();
  server.emit("upgrade", req, socket, Buffer.alloc(0));
  return socket;
}

beforeEach(() => {
  mockIoServerCtorArgs.length = 0;
  mockIoHandleUpgrade.mockReset();
});

describe("websockets service — path-less layout", () => {
  let httpServer: http.Server;
  // The global setup.ts sets env.URL to https://app.outline.dev, which is in
  // the isCloudHosted allowlist and short-circuits the on-prem origin check.
  // Override to a non-cloud, path-less URL so BASE_PATH stays "" but
  // isCloudHosted is false, allowing the origin-check assertions to run.
  const originalEnvUrl = env.URL;
  const originalSharedEnvUrl = sharedEnv.URL;
  const onPremUrl = "https://kms.example.test";

  beforeEach(() => {
    env.URL = sharedEnv.URL = onPremUrl;
    httpServer = http.createServer();
    init(makeStubKoa(), httpServer, ["websockets"]);
  });

  afterEach(() => {
    httpServer.removeAllListeners();
    env.URL = originalEnvUrl;
    sharedEnv.URL = originalSharedEnvUrl;
  });

  it("registers exactly one upgrade listener after init", () => {
    expect(httpServer.listeners("upgrade")).toHaveLength(1);
  });

  it("constructs IO.Server with path '/realtime' when BASE_PATH is empty", () => {
    expect(env.BASE_PATH).toBe("");
    expect(mockIoServerCtorArgs).toHaveLength(1);
    expect(mockIoServerCtorArgs[0].opts.path).toBe("/realtime");
  });

  it("rejects upgrade for /realtime when origin does not match env.URL", () => {
    const socket = emitUpgrade(
      httpServer,
      "/realtime/?EIO=4&transport=websocket",
      "https://attacker.example"
    );
    expect(socket.ended).toContain("400 Bad Request");
    expect(mockIoHandleUpgrade).not.toHaveBeenCalled();
  });

  it("delegates to engine.io when /realtime origin matches env.URL", () => {
    const socket = emitUpgrade(
      httpServer,
      "/realtime/?EIO=4&transport=websocket",
      onPremUrl
    );
    expect(socket.ended).toBeUndefined();
    expect(mockIoHandleUpgrade).toHaveBeenCalledTimes(1);
  });

  it("closes unknown paths with 400 when collaboration is not registered", () => {
    const socket = emitUpgrade(httpServer, "/some-other-path");
    expect(socket.ended).toContain("400 Bad Request");
    expect(mockIoHandleUpgrade).not.toHaveBeenCalled();
  });

  it("returns silently for non-realtime upgrades when collaboration is registered", () => {
    httpServer.removeAllListeners();
    httpServer = http.createServer();
    init(makeStubKoa(), httpServer, ["websockets", "collaboration"]);
    const socket = emitUpgrade(httpServer, "/collaboration/foo-doc");
    expect(socket.ended).toBeUndefined();
    expect(mockIoHandleUpgrade).not.toHaveBeenCalled();
  });
});

describe("websockets service — sub-path layout", () => {
  let httpServer: http.Server;
  const originalEnvUrl = env.URL;
  const originalSharedEnvUrl = sharedEnv.URL;
  const subpathUrl = "https://app.outline.dev/kms";

  beforeEach(() => {
    env.URL = sharedEnv.URL = subpathUrl;
    httpServer = http.createServer();
    init(makeStubKoa(), httpServer, ["websockets"]);
  });

  afterEach(() => {
    httpServer.removeAllListeners();
    env.URL = originalEnvUrl;
    sharedEnv.URL = originalSharedEnvUrl;
  });

  it("constructs IO.Server with path '/kms/realtime'", () => {
    expect(env.BASE_PATH).toBe("/kms");
    expect(mockIoServerCtorArgs).toHaveLength(1);
    expect(mockIoServerCtorArgs[0].opts.path).toBe("/kms/realtime");
  });

  it("rejects /realtime (path-less) when running under sub-path layout", () => {
    const socket = emitUpgrade(
      httpServer,
      "/realtime/?EIO=4&transport=websocket",
      "https://app.outline.dev"
    );
    expect(socket.ended).toContain("400 Bad Request");
    expect(mockIoHandleUpgrade).not.toHaveBeenCalled();
  });

  it("delegates /kms/realtime to engine.io when origin matches", () => {
    // Browser sends origin without the path component;
    // env.URL.startsWith(origin) → true.
    const socket = emitUpgrade(
      httpServer,
      "/kms/realtime/?EIO=4&transport=websocket",
      "https://app.outline.dev"
    );
    expect(socket.ended).toBeUndefined();
    expect(mockIoHandleUpgrade).toHaveBeenCalledTimes(1);
  });

  it("rejects /kms/realtime when origin does not match", () => {
    const socket = emitUpgrade(
      httpServer,
      "/kms/realtime/?EIO=4&transport=websocket",
      "https://attacker.example"
    );
    expect(socket.ended).toContain("400 Bad Request");
    expect(mockIoHandleUpgrade).not.toHaveBeenCalled();
  });
});

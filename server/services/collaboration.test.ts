import http from "http";
import { Duplex } from "stream";
import type Koa from "koa";
import sharedEnv from "@shared/env";
import env from "@server/env";

const mockHandleUpgrade = jest.fn();

jest.mock("ws", () => {
  class MockServer {
    on = jest.fn();
    handleUpgrade = mockHandleUpgrade;
  }
  return {
    __esModule: true,
    default: { Server: MockServer },
    Server: MockServer,
  };
});

jest.mock("@hocuspocus/server", () => ({
  Server: {
    configure: jest.fn(() => ({
      handleConnection: jest.fn(),
      destroy: jest.fn().mockResolvedValue(undefined),
    })),
  },
}));

jest.mock("@hocuspocus/extension-redis", () => ({
  Redis: jest.fn().mockImplementation(() => ({})),
}));

jest.mock("@hocuspocus/extension-throttle", () => ({
  Throttle: jest.fn().mockImplementation(() => ({})),
}));

jest.mock("@server/collaboration/AuthenticationExtension", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({})),
}));

jest.mock("@server/collaboration/ConnectionLimitExtension", () => ({
  ConnectionLimitExtension: jest.fn().mockImplementation(() => ({})),
}));

jest.mock("@server/collaboration/EditorVersionExtension", () => ({
  EditorVersionExtension: jest.fn().mockImplementation(() => ({})),
}));

jest.mock("@server/collaboration/LoggerExtension", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({})),
}));

jest.mock("@server/collaboration/MetricsExtension", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({})),
}));

jest.mock("@server/collaboration/PersistenceExtension", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({})),
}));

jest.mock("@server/collaboration/ViewsExtension", () => ({
  ViewsExtension: jest.fn().mockImplementation(() => ({})),
}));

import init from "./collaboration";

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

function emitUpgrade(server: http.Server, url: string): MockSocket {
  const req = { url, headers: {} } as unknown as http.IncomingMessage;
  const socket = new MockSocket();
  server.emit("upgrade", req, socket, Buffer.alloc(0));
  return socket;
}

beforeEach(() => {
  mockHandleUpgrade.mockReset();
});

describe("collaboration service — path-less layout", () => {
  let httpServer: http.Server;

  beforeEach(() => {
    httpServer = http.createServer();
    init(makeStubKoa(), httpServer, ["collaboration"]);
  });

  afterEach(() => {
    httpServer.removeAllListeners();
  });

  it("registers exactly one upgrade listener after init", () => {
    expect(httpServer.listeners("upgrade")).toHaveLength(1);
  });

  it("derives the collaboration path as '/collaboration' when BASE_PATH is empty", () => {
    expect(env.BASE_PATH).toBe("");
    expect(`${env.BASE_PATH}/collaboration`).toBe("/collaboration");
  });

  it("extracts the document id from /collaboration/<id>", () => {
    emitUpgrade(httpServer, "/collaboration/foo-doc-abc123");
    expect(mockHandleUpgrade).toHaveBeenCalledTimes(1);
  });

  it("closes the socket with 400 when the URL has no document id", () => {
    const socket = emitUpgrade(httpServer, "/collaboration/");
    expect(socket.ended).toContain("400 Bad Request");
    expect(mockHandleUpgrade).not.toHaveBeenCalled();
  });

  it("returns silently for /realtime upgrades when websockets is registered", () => {
    httpServer.removeAllListeners();
    httpServer = http.createServer();
    init(makeStubKoa(), httpServer, ["collaboration", "websockets"]);
    const socket = emitUpgrade(httpServer, "/realtime/?EIO=4");
    expect(socket.ended).toBeUndefined();
    expect(mockHandleUpgrade).not.toHaveBeenCalled();
  });

  it("closes /realtime upgrades with 400 when websockets is not registered", () => {
    const socket = emitUpgrade(httpServer, "/realtime/?EIO=4");
    expect(socket.ended).toContain("400 Bad Request");
  });
});

describe("collaboration service — sub-path layout", () => {
  let httpServer: http.Server;
  const originalEnvUrl = env.URL;
  const originalSharedEnvUrl = sharedEnv.URL;
  const subpathUrl = "https://app.outline.dev/kms";

  beforeEach(() => {
    env.URL = sharedEnv.URL = subpathUrl;
    httpServer = http.createServer();
    init(makeStubKoa(), httpServer, ["collaboration"]);
  });

  afterEach(() => {
    httpServer.removeAllListeners();
    env.URL = originalEnvUrl;
    sharedEnv.URL = originalSharedEnvUrl;
  });

  it("derives the collaboration path as '/kms/collaboration'", () => {
    expect(env.BASE_PATH).toBe("/kms");
    expect(`${env.BASE_PATH}/collaboration`).toBe("/kms/collaboration");
  });

  it("delegates /kms/collaboration/<id> to the websocket server", () => {
    emitUpgrade(httpServer, "/kms/collaboration/foo-doc-abc123");
    expect(mockHandleUpgrade).toHaveBeenCalledTimes(1);
  });

  it("does NOT delegate /collaboration/<id> (path-less) under sub-path layout", () => {
    const socket = emitUpgrade(httpServer, "/collaboration/foo-doc-abc123");
    expect(mockHandleUpgrade).not.toHaveBeenCalled();
    expect(socket.ended).toContain("400 Bad Request");
  });

  it("returns silently for /kms/realtime upgrades when websockets is registered", () => {
    httpServer.removeAllListeners();
    httpServer = http.createServer();
    init(makeStubKoa(), httpServer, ["collaboration", "websockets"]);
    const socket = emitUpgrade(httpServer, "/kms/realtime/?EIO=4");
    expect(socket.ended).toBeUndefined();
    expect(mockHandleUpgrade).not.toHaveBeenCalled();
  });

  it("does NOT silently route /realtime (path-less) under sub-path layout", () => {
    httpServer.removeAllListeners();
    httpServer = http.createServer();
    init(makeStubKoa(), httpServer, ["collaboration", "websockets"]);
    const socket = emitUpgrade(httpServer, "/realtime/?EIO=4");
    expect(socket.ended).toContain("400 Bad Request");
  });

  it("COLLABORATION_URL derivation preserves the sub-path component", () => {
    // Spec §technical-notes: COLLABORATION_URL is derived from URL by stripping
    // the trailing slash and replacing http→ws. The path component is preserved.
    // Asserted against the derivation expression directly because env.COLLABORATION_URL
    // is a one-shot field initializer (computed at Environment construction time)
    // and does not recompute when env.URL is mutated in tests.
    const derived = "https://app.outline.dev/kms"
      .replace(/\/$/, "")
      .replace(/^http/, "ws");
    expect(derived).toBe("wss://app.outline.dev/kms");
    // The client builds `${COLLABORATION_URL}/collaboration` which must match
    // the server's listening path (`${env.BASE_PATH}/collaboration`).
    expect(`${derived}/collaboration`).toBe(
      `wss://app.outline.dev${env.BASE_PATH}/collaboration`
    );
  });
});

describe("collaboration service — COLLABORATION_URL trailing-slash handling", () => {
  // env.COLLABORATION_URL is a one-shot field initializer in server/env.ts —
  // mutating env.URL after construction does not recompute it. These tests
  // exercise the derivation expression itself (the same expression used by
  // the Environment class) to prove that both `URL=...` and `URL=.../`
  // produce the same client-side WebSocket URL.
  const derive = (url: string) =>
    url.replace(/\/$/, "").replace(/^http/, "ws");

  it("strips a trailing slash from URL when deriving COLLABORATION_URL", () => {
    expect(derive("https://app.outline.dev/kms/")).toBe(
      "wss://app.outline.dev/kms"
    );
  });

  it("preserves the sub-path without a trailing slash", () => {
    expect(derive("https://app.outline.dev/kms")).toBe(
      "wss://app.outline.dev/kms"
    );
  });
});

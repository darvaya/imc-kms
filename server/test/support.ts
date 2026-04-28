import { faker } from "@faker-js/faker";
import Koa from "koa";
import mount from "koa-mount";
import Router from "koa-router";
import type { Transaction } from "sequelize";
import sharedEnv from "@shared/env";
import { createContext } from "@server/context";
import env from "@server/env";
import type { User } from "@server/models";
import onerror from "@server/onerror";
import webService from "@server/services/web";
import { sequelize } from "@server/storage/database";
import type { APIContext } from "@server/types";
import { AuthenticationType } from "@server/types";
import TestServer from "./TestServer";

function buildOuterApp(basePath: string) {
  const innerApp = webService();
  const outerApp = new Koa();
  onerror(outerApp);

  // Mirror the production topology: the `/_health` router lives on the outer
  // app (registered before the mount) so process-level health probes don't
  // depend on BASE_PATH. The handler is a stub here — it asserts only the
  // routing layer, not real DB/Redis liveness, since unit tests don't need
  // to verify storage connectivity.
  const healthRouter = new Router();
  healthRouter.get("/_health", (ctx) => {
    ctx.body = "OK";
  });
  outerApp.use(healthRouter.routes());

  outerApp.use(mount(basePath || "/", innerApp));
  return outerApp;
}

export function getTestServer() {
  const outerApp = buildOuterApp(env.BASE_PATH);
  const server = new TestServer(outerApp);

  // Closing sequelize here would break sibling describe blocks that share the
  // same singleton connection. Global cleanup is owned by
  // `server/test/globalTeardown.js` (wired up via .jestconfig.json).
  afterAll(() => server.close());

  return server;
}

/**
 * Builds a TestServer that mirrors the production outer/inner topology with a
 * specific BASE_PATH (e.g. "/kms"). Snapshots and restores `env.URL` /
 * `sharedEnv.URL` so the rest of the suite continues to see the path-less
 * defaults from `setup.ts`.
 */
export function getSubpathTestServer(basePath: string) {
  const originalEnvUrl = env.URL;
  const originalSharedEnvUrl = sharedEnv.URL;

  env.URL = sharedEnv.URL = `https://app.outline.dev${basePath}`;

  const outerApp = buildOuterApp(basePath);
  const server = new TestServer(outerApp);

  const disconnect = () => {
    env.URL = originalEnvUrl;
    sharedEnv.URL = originalSharedEnvUrl;
    server.close();
  };

  afterAll(disconnect);

  return server;
}

/**
 * Set the environment to be self hosted.
 */
export function setSelfHosted() {
  env.URL = sharedEnv.URL = `https://${faker.internet.domainName()}`;
}

export function withAPIContext<T>(
  user: User,
  fn: (ctx: APIContext) => T
): Promise<T> {
  return sequelize.transaction(async (transaction: Transaction) => {
    const state = {
      auth: {
        user,
        type: AuthenticationType.APP,
        token: `test-token-${user.id}`,
      },
      transaction,
    };
    return fn({
      ...createContext({ user, transaction }),
      state,
      request: {
        ip: faker.internet.ip(),
      },
    } as APIContext);
  });
}

/**
 * Helper function to convert an object to form-urlencoded string.
 * Useful for testing OAuth endpoints that expect application/x-www-form-urlencoded content type.
 *
 * @param obj Object to convert to form-urlencoded string
 * @returns Form-urlencoded string representation of the object
 */
export function toFormData(obj: Record<string, any>): string {
  return Object.entries(obj)
    .filter(([_, value]) => value !== undefined)
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
    )
    .join("&");
}

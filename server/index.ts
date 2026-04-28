/* oxlint-disable @typescript-eslint/no-misused-promises */
/* oxlint-disable import/order */
import env from "./env";

import "./logging/tracer"; // must come before importing any instrumented module

import http from "http";
import https from "https";
import type { Context } from "koa";
import Koa from "koa";
import helmet from "koa-helmet";
import logger from "koa-logger";
import mount from "koa-mount";
import Router from "koa-router";
import type { AddressInfo } from "net";
import stoppable from "stoppable";
import throng from "throng";
import escape from "lodash/escape";
import Logger from "./logging/Logger";
import services from "./services";
import { getArg } from "./utils/args";
import { getSSLOptions } from "./utils/ssl";
import { defaultRateLimiter } from "@server/middlewares/rateLimiter";
import { printEnv, checkPendingMigrations } from "./utils/startup";
import { checkUpdates } from "./utils/updates";
import onerror from "./onerror";
import ShutdownHelper, { ShutdownOrder } from "./utils/ShutdownHelper";
import { checkConnection, sequelize } from "./storage/database";
import Redis from "@server/storage/redis";
import Metrics from "@server/logging/Metrics";
import { PluginManager } from "./utils/PluginManager";

// The number of processes to run, defaults to the number of CPU's available
// for the web service, and 1 for collaboration unless REDIS_COLLABORATION_URL is set.
let webProcessCount = env.WEB_CONCURRENCY;

if (env.SERVICES.includes("collaboration") && !env.REDIS_COLLABORATION_URL) {
  if (webProcessCount !== 1) {
    Logger.info(
      "lifecycle",
      "Note: Restricting process count to 1 due to use of collaborative service without REDIS_COLLABORATION_URL"
    );
  }

  webProcessCount = 1;
}

// This function will only be called once in the original process
async function master() {
  await checkConnection(sequelize);
  await checkPendingMigrations();
  await printEnv();

  if (env.TELEMETRY && env.isProduction) {
    void checkUpdates();
    setInterval(checkUpdates, 24 * 3600 * 1000);
  }
}

// This function will only be called in each forked process
async function start(_id: number, disconnect: () => void) {
  // Ensure plugins are loaded
  PluginManager.loadPlugins();

  // Find if SSL certs are available
  const ssl = getSSLOptions();
  const useHTTPS = !!ssl.key && !!ssl.cert;

  // If a --port flag is passed then it takes priority over the env variable
  const normalizedPort = getArg("port", "p") || env.PORT;
  const outerApp = new Koa();
  const innerApp = new Koa();
  const server = stoppable(
    useHTTPS
      ? https.createServer(ssl, outerApp.callback())
      : http.createServer(outerApp.callback()),
    ShutdownHelper.connectionGraceTimeout
  );
  const router = new Router();

  // Trust proxy headers on the outer app — `ctx` is created from outerApp so
  // proxy=true must live there for ctx.protocol / ctx.ips to be correct.
  if (env.isProduction) {
    outerApp.proxy = true;
  }

  // HTTP request logger (inner app — health probes intentionally bypass).
  if (env.DEBUG.includes("http")) {
    innerApp.use(logger((str) => Logger.info("http", str)));
  }

  innerApp.use(helmet());

  // catch errors in one place, automatically set status and response headers.
  // The custom ctx.onerror is read off the prototype chain rooted at
  // outerApp.context (where the request ctx is created), so install it on the
  // outer app even though most requests are served by inner middleware.
  onerror(outerApp);

  // Apply default rate limit to all routed requests; /_health bypasses.
  innerApp.use(defaultRateLimiter());

  /** Perform a redirect on the browser so that the user's auth cookies are included in the request. */
  outerApp.context.redirectOnClient = function (
    this: Context,
    /** The URL to redirect to */
    url: string,
    /**
     * The HTTP method to use for the redirect. Use POST when preventing links in emails from being
     * clicked by bots. Otherwise, use GET.
     */
    method: "GET" | "POST" = "GET"
  ) {
    this.type = "text/html";

    if (method === "POST") {
      // For POST method, create a form that auto-submits
      const urlObj = new URL(url);
      const formAction = `${urlObj.origin}${urlObj.pathname}`;
      const searchParams = urlObj.searchParams;

      let formFields = "";
      searchParams.forEach((value, key) => {
        formFields += `<input type="hidden" name="${escape(
          key
        )}" value="${escape(value)}" />`;
      });

      if (this.userAgent.isBot) {
        formFields += `
          <p>If you are not redirected automatically, please click the button below.</p>
          <input type="submit" value="Continue" />
        `;
      }

      this.body = `
<html>
<head>
  <title>Redirecting…</title>
</head>
<body>
  <form id="redirect-form" method="POST" action="${formAction}">
    ${formFields}
  </form>
  <script nonce="${this.state.cspNonce}">
    ${!this.userAgent.isBot} && document.getElementById('redirect-form').submit();
  </script>
</body>
</html>`;
    } else {
      // Default GET method using meta refresh
      this.body = `
<html>
<head>
<meta http-equiv="refresh" content="0;URL='${escape(url)}'" />
</head>
</html>`;
    }
  };

  // Add a health check endpoint to all services
  router.get("/_health", async (ctx) => {
    try {
      await sequelize.query("SELECT 1");
    } catch (err) {
      Logger.error("Database connection failed", err);
      ctx.status = 500;
      return;
    }

    try {
      await Redis.defaultClient.ping();
    } catch (err) {
      Logger.error("Redis ping failed", err);
      ctx.status = 500;
      return;
    }

    ctx.body = "OK";
  });

  // The health router lives on the outer app so health probes don't depend on
  // BASE_PATH. Must be registered before the mount so it short-circuits ahead
  // of the inner app.
  outerApp.use(router.routes());

  // loop through requested services at startup
  for (const name of env.SERVICES) {
    if (!Object.keys(services).includes(name)) {
      throw new Error(`Unknown service ${name}`);
    }

    Logger.info("lifecycle", `Starting ${name} service`);
    const init = services[name as keyof typeof services];
    await init(innerApp, server as https.Server, env.SERVICES);
  }

  // Mount the inner app under BASE_PATH so existing route literals (`/api/*`,
  // `/auth/*`, `/oauth/*`, the SPA catch-all) work mount-relative. koa-mount
  // returns the inner middleware unchanged when prefix === "/", so the empty
  // BASE_PATH branch is a no-op.
  outerApp.use(mount(env.BASE_PATH || "/", innerApp));

  server.on("error", (err) => {
    if ("code" in err && err.code === "EADDRINUSE") {
      Logger.error(`Port ${normalizedPort} is already in use. Exiting…`, err);
      process.exit(0);
    }

    if ("code" in err && err.code === "EACCES") {
      Logger.error(
        `Port ${normalizedPort} requires elevated privileges. Exiting…`,
        err
      );
      process.exit(0);
    }

    throw err;
  });
  server.on("listening", () => {
    const address = server.address();
    const port = (address as AddressInfo).port;

    Logger.info(
      "lifecycle",
      `Listening on ${useHTTPS ? "https" : "http"}://localhost:${port} / ${
        env.URL
      }`
    );
  });

  server.listen(normalizedPort);
  server.setTimeout(env.REQUEST_TIMEOUT);

  ShutdownHelper.add(
    "server",
    ShutdownOrder.last,
    () =>
      new Promise((resolve, reject) => {
        // Calling stop prevents new connections from being accepted and waits for
        // existing connections to close for the grace period before forcefully
        // closing them.
        server.stop((err, gracefully) => {
          disconnect();

          if (err) {
            reject(err);
          } else {
            resolve(gracefully);
          }
        });
      })
  );

  ShutdownHelper.add("metrics", ShutdownOrder.last, () => Metrics.flush());

  // Handle uncaught promise rejections
  process.on("unhandledRejection", (error: Error) => {
    Logger.error("Unhandled promise rejection", error, {
      stack: error.stack,
    });
  });

  // Handle shutdown signals
  process.once("SIGTERM", () => ShutdownHelper.execute());
  process.once("SIGINT", () => ShutdownHelper.execute());
}

const isWebProcess =
  env.SERVICES.includes("web") ||
  env.SERVICES.includes("api") ||
  env.SERVICES.includes("collaboration");

const processCount = isWebProcess ? (webProcessCount ?? 1) : 1;

// When running a single process, skip throng/cluster entirely to avoid
// Node 24+ EPIPE errors with the cluster IPC channel.
if (processCount <= 1) {
  void (async () => {
    await master();
    await start(1, () => process.exit(0));
  })();
} else {
  void throng({
    master,
    worker: start,
    count: processCount,
  });
}

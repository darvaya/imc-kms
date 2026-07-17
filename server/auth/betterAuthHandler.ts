import type { Next } from "koa";
import env from "@server/env";
import type { AppContext } from "@server/types";
import { getBetterAuth } from "./betterAuth";

/**
 * Koa middleware that bridges better-auth's Node.js handler. This middleware
 * intercepts requests to `/api/better-auth/*`, converts them to Node.js
 * req/res, and passes them to better-auth's `toNodeHandler`.
 *
 * IMPORTANT: This middleware must be mounted BEFORE body-parser middleware
 * because better-auth needs to parse the request body itself.
 */
export default function betterAuthHandler() {
  return async function betterAuthMiddleware(
    ctx: AppContext,
    next: Next
  ): Promise<void> {
    // `ctx.path` is mount-relative (koa-mount strips BASE_PATH before the inner
    // app runs), so the sub-path-agnostic literal is correct here.
    if (!ctx.path.startsWith("/api/better-auth")) {
      return next();
    }

    const { toNodeHandler } = await import("better-auth/node");
    const auth = await getBetterAuth();
    const handler = toNodeHandler(auth);

    // koa-mount stripped BASE_PATH from `ctx.req.url` (Koa's `path` setter
    // writes back to `req.url`). better-auth's `basePath` includes BASE_PATH
    // (see betterAuth.ts), so restore the full public path on the raw Node
    // request that `toNodeHandler` reads. Without this the handler receives
    // `/api/better-auth/*` while better-auth matches `${BASE_PATH}/api/better-auth/*`
    // → 404. No-op when BASE_PATH is empty (root-origin deploy).
    const strippedUrl = ctx.req.url;
    if (env.BASE_PATH && strippedUrl) {
      ctx.req.url = `${env.BASE_PATH}${strippedUrl}`;
    }

    // Prevent Koa from sending its own response — better-auth writes
    // directly to ctx.res via the Node.js handler.
    ctx.respond = false;

    try {
      await new Promise<void>((resolve, reject) => {
        ctx.res.on("finish", resolve);
        ctx.res.on("error", reject);
        handler(ctx.req, ctx.res).catch(reject);
      });
    } finally {
      // Restore the mount-relative URL for any post-response bookkeeping.
      ctx.req.url = strippedUrl;
    }
  };
}

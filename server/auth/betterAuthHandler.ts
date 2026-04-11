import type { Next } from "koa";
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
    if (!ctx.path.startsWith("/api/better-auth")) {
      return next();
    }

    const { toNodeHandler } = await import("better-auth/node");
    const auth = await getBetterAuth();
    const handler = toNodeHandler(auth);

    // Prevent Koa from sending its own response — better-auth writes
    // directly to ctx.res via the Node.js handler.
    ctx.respond = false;

    await new Promise<void>((resolve, reject) => {
      ctx.res.on("finish", resolve);
      ctx.res.on("error", reject);
      handler(ctx.req, ctx.res).catch(reject);
    });
  };
}

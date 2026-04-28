import type { Next } from "koa";
import { Scope } from "@shared/types";
import env from "@server/env";
import AuthenticationHelper from "@shared/helpers/AuthenticationHelper";
import type { AppContext } from "@server/types";
import {
  generateRawToken,
  bundleToken,
  unbundleToken,
} from "@server/utils/csrf";
import { getCookieDomain } from "@shared/utils/domains";
import { CSRF } from "@shared/constants";
import { CSRFError } from "@server/errors";
import { parseAuthentication } from "./authentication";

/**
 * Middleware that generates and attaches CSRF tokens for safe methods
 */
export function attachCSRFToken() {
  return async function attachCSRFTokenMiddleware(ctx: AppContext, next: Next) {
    // Only attach tokens for safe methods that don't mutate state
    if (["GET", "HEAD", "OPTIONS"].includes(ctx.method)) {
      const raw = generateRawToken(16);
      const bundled = bundleToken(raw, env.SECRET_KEY);

      // Set cookie that JavaScript can read (not HttpOnly)
      ctx.cookies.set(CSRF.cookieName, bundled, {
        httpOnly: false,
        sameSite: "lax",
        domain: getCookieDomain(ctx.request.hostname, env.isCloudHosted),
      });
    }

    await next();
  };
}

/**
 * Middleware that verifies CSRF tokens for mutating requests
 */
export function verifyCSRFToken() {
  /**
   * Determines if a request requires CSRF protection
   */
  const shouldProtectRequest = (ctx: AppContext): boolean => {
    // Skip if not a potentially mutating method
    if (["GET", "HEAD", "OPTIONS"].includes(ctx.method)) {
      return false;
    }

    // If not using cookie-based auth, skip CSRF protection
    const { transport } = parseAuthentication(ctx);
    if (transport !== "cookie") {
      return false;
    }

    // The previous `ctx.originalUrl.startsWith("/api/")` guard cannot be kept
    // under sub-path deployment: koa-mount rewrites `ctx.path` (and `ctx.url`)
    // for the lifetime of the request but does NOT touch `ctx.originalUrl`,
    // so under URL=http://host/kms `ctx.originalUrl` looks like
    // `/kms/api/...` and `startsWith("/api/")` mis-detects legitimate API
    // requests. Note: verifyCSRFToken is also attached on /auth and /oauth
    // routes (server/routes/auth/index.ts, server/routes/oauth/index.ts), so
    // dropping the API-route guard expands the read-scope shortcut to those
    // surfaces — see slice 01 completed.md for the rationale and follow-up.
    const canAccessWithReadOnly = AuthenticationHelper.canAccess(ctx.path, [
      Scope.Read,
    ]);

    // If it can be accessed with read-only scope, it doesn't need CSRF protection
    if (canAccessWithReadOnly) {
      return false;
    }

    // Protect all other mutating requests
    return true;
  };

  return async function verifyCSRFTokenMiddleware(ctx: AppContext, next: Next) {
    if (!shouldProtectRequest(ctx)) {
      await next();
      return;
    }

    // Get token from cookie
    const cookieVal = ctx.cookies.get(CSRF.cookieName);
    if (!cookieVal) {
      throw CSRFError("CSRF token missing from cookie");
    }

    // Get token from header or form field depending on type
    // Access the already-parsed body from koa-body middleware
    const inputVal =
      ctx.get(CSRF.headerName) || ctx.request.body?.[CSRF.fieldName];

    if (!inputVal) {
      throw CSRFError("CSRF token missing from request");
    }

    // Verify both tokens are valid HMAC-signed tokens
    const { valid: cookieValid } = unbundleToken(cookieVal, env.SECRET_KEY);
    const { valid: inputValid } = unbundleToken(inputVal, env.SECRET_KEY);

    if (!cookieValid || !inputValid) {
      throw CSRFError("CSRF token invalid or malformed");
    }

    // Verify tokens match (double-submit check)
    if (cookieVal !== inputVal) {
      throw CSRFError("CSRF token mismatch");
    }

    await next();
  };
}

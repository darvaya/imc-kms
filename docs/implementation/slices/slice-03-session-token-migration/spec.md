# Slice: Session & Token Migration

## Summary

Replace Outline's custom JWT session system (per-user `jwtSecret`, transfer tokens, manual cookie management) with Better Auth's built-in session management. After this slice, all session handling is fully delegated to Better Auth, the custom JWT utilities are removed, and subdomain-aware session sharing works correctly.

## Motivation

After Slices 1 and 2, Better Auth handles login and the legacy providers are gone, but the application still carries Outline's custom JWT session layer: per-user secrets, transfer tokens for subdomain routing, and manual cookie management in `server/utils/authentication.ts` and `server/utils/jwt.ts`. This dual session system adds complexity and potential inconsistency. Fully migrating to Better Auth's session management simplifies the auth stack and leverages Better Auth's built-in session security features (CSRF protection, expiry, rotation).

## User stories

- As a user, I want my session to persist reliably across page reloads and subdomain navigation without unexpected logouts.
- As a developer, I want a single session management system instead of two layered on top of each other, so that auth behavior is predictable and debuggable.
- As an admin, I want sessions to have proper expiry and security controls managed by Better Auth.

## Acceptance criteria

- [ ] The custom JWT session utilities (`server/utils/jwt.ts`) are removed or reduced to non-auth uses only (e.g., email confirmation tokens if any remain)
- [ ] The custom session/signin utilities in `server/utils/authentication.ts` (cookie setting, transfer tokens, `signIn()`) are replaced by Better Auth's session handling
- [ ] The `jwtSecret` field on the User model is no longer used for session validation
- [ ] Transfer tokens (used for subdomain session handoff) are replaced by Better Auth's session mechanism or a compatible alternative
- [ ] API key authentication continues to work independently of Better Auth sessions
- [ ] Sessions have configurable expiry managed by Better Auth
- [ ] The auth middleware (`server/middlewares/authentication.ts`) uses only Better Auth for session validation (no fallback to legacy JWT)
- [ ] All existing API routes that require authentication work correctly with Better Auth sessions

## Scope

### In scope

- Removing or replacing custom JWT session creation/validation
- Removing transfer token logic
- Removing manual cookie management for auth sessions
- Updating the auth middleware to use Better Auth sessions exclusively
- Ensuring subdomain session sharing works (cookie domain configuration or Better Auth's session strategy)
- Verifying API key auth still works alongside Better Auth sessions
- Removing the `jwtSecret` field from the User model (or marking it deprecated)

### Out of scope

- OAuth server functionality (Outline as OAuth provider)
- Database schema migration to drop unused columns (e.g., `jwtSecret`) — can be a follow-up migration
- Performance optimization of session lookups
- Adding new session features (e.g., "remember me", device management)

## Technical notes

- Outline supports multi-tenant subdomains (e.g., `team1.kms.example.com`). The current system uses transfer tokens to move sessions from the apex domain to team subdomains after OIDC login. Better Auth's session cookie needs to be configured with the correct domain scope (e.g., `.kms.example.com`) to work across subdomains, or an alternative handoff mechanism is needed.
- The `parseAuthentication()` function in `server/middlewares/authentication.ts` currently checks multiple token sources: Authorization header, body, query params, and cookies. After this slice, it should check Better Auth sessions and API keys only.
- Better Auth stores sessions in its own database tables. Ensure the session lookup is efficient and doesn't add significant latency to every API request.
- The User model's `getJwtToken()` method is used in various places to generate session tokens. All call sites need to be updated or removed.

## Dependencies

- Slice 1 (`slice-01-better-auth-microsoft-oidc`) must be completed — Better Auth must be installed and configured.
- Slice 2 (`slice-02-remove-legacy-auth-providers`) must be completed — legacy providers and Passport.js must be removed so there's no dual-system conflict.

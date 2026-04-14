# Slice: Better Auth Core Setup + Microsoft OIDC Login

## Summary

Replace Passport.js with [better-auth](https://www.better-auth.com/) as the authentication framework and configure Microsoft Entra ID as the sole OIDC login provider. After this slice, users can sign in via Microsoft SSO, sessions are managed by Better Auth, and the existing Passport.js auth middleware is replaced.

## Motivation

The current authentication system uses Passport.js with a custom JWT session layer, per-user JWT secrets, transfer tokens, and a plugin-based provider architecture. This is complex to maintain and extend. Better Auth provides a modern, batteries-included auth library with built-in session management, OIDC support, and a simpler integration model. The company uses Microsoft Entra ID (Azure AD) for identity, so Microsoft OIDC SSO is the only required login method.

## User stories

- As an employee, I want to click "Sign in with Microsoft" and be authenticated via my company Microsoft account, so that I can access the KMS.
- As an employee, I want to log out and have my session fully terminated, so that my account is secure.
- As an admin, I want only Microsoft SSO as the login method, so that all access goes through our company identity provider.

## Acceptance criteria

- [ ] `better-auth` is installed and configured as the auth framework on the Koa.js backend
- [ ] Microsoft Entra ID is configured as an OIDC provider via Better Auth's generic OIDC or OAuth plugin
- [ ] Clicking "Sign in" on the login page initiates the Microsoft OIDC flow and successfully authenticates the user
- [ ] After successful OIDC login, a user record is created/matched in the database and a valid session is established
- [ ] Logout clears the Better Auth session and redirects to the login page (no auto-redirect loop)
- [ ] The existing Passport.js authentication middleware (`server/middlewares/authentication.ts`) is replaced with Better Auth session validation
- [ ] API requests with a valid session are authenticated; requests without a valid session return 401
- [ ] Environment variables for Microsoft OIDC configuration are documented (client ID, client secret, tenant ID, redirect URI)

## Scope

### In scope

- Installing and configuring `better-auth` with the Koa.js backend
- Setting up Microsoft Entra ID as the OIDC provider (authorization code flow)
- Replacing Passport.js auth middleware with Better Auth session validation
- User provisioning on first login (create user + team association from OIDC profile)
- Login and logout flows working end-to-end
- Session cookie management via Better Auth
- Updating the frontend login page to point to the new auth endpoints

### Out of scope

- Removing legacy auth plugins (Google, Slack, Azure, Discord, Email) — deferred to Slice 2
- Removing Passport.js dependencies from package.json — deferred to Slice 2
- Migrating the custom JWT session system (per-user jwtSecret, transfer tokens) — deferred to Slice 3
- API key authentication — remains unchanged in this slice
- OAuth server functionality (Outline as OAuth provider) — deferred to future work
- Data migration of existing users/sessions

## Technical notes

- Better Auth needs a Koa adapter or integration since it primarily supports Node.js HTTP. Check `better-auth`'s framework adapters — it has a generic `toNodeHandler` that can be mounted on Koa via `koa-mount` or similar.
- Microsoft Entra ID OIDC discovery URL: `https://login.microsoftonline.com/{tenant-id}/v2.0/.well-known/openid-configuration`
- Better Auth manages its own database tables for sessions and accounts. It supports multiple ORMs — check compatibility with Sequelize (used by Outline) or whether a separate Prisma/Drizzle connection is needed for auth tables only.
- The existing `accountProvisioner.ts` command handles user/team creation on first login. This logic needs to be preserved or adapted for Better Auth's callback/hook system.
- The frontend login scene is at `app/scenes/Login/` — it currently renders provider buttons based on the API response from `/api/auth.config`.
- Outline uses subdomains per team. The current auth flow uses "transfer tokens" to move sessions across subdomains. This slice should establish basic session handling; subdomain-aware session sharing is deferred to Slice 3.

## Dependencies

- None — this is the first slice in the auth migration.

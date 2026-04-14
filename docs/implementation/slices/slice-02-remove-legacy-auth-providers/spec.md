# Slice: Remove Legacy Auth Providers & Cleanup

## Summary

Remove all unused authentication providers (Google, Slack, Azure, Discord, Email magic links) and their associated plugin code, then remove Passport.js and its dependencies from the project. After this slice, Microsoft OIDC via Better Auth is the only auth path and no Passport.js code remains.

## Motivation

After Slice 1 establishes Better Auth with Microsoft OIDC as the sole login method, the legacy Passport.js-based auth plugins become dead code. Keeping them increases maintenance burden, dependency surface, and confusion. Removing them ensures a clean, single auth path and reduces the attack surface.

## User stories

- As a developer, I want unused auth provider code removed, so that the codebase is simpler and easier to maintain.
- As an admin, I want the login page to show only the Microsoft SSO option, so that users are not confused by irrelevant auth methods.

## Acceptance criteria

- [ ] The OIDC plugin (`plugins/oidc/`) is removed or fully replaced by Better Auth's OIDC handling from Slice 1
- [ ] The Google auth plugin (`plugins/google/`) is removed
- [ ] The Slack auth plugin (`plugins/slack/`) is removed
- [ ] The Azure auth plugin (`plugins/azure/`) is removed
- [ ] The Discord auth plugin (`plugins/discord/`) is removed
- [ ] The Email magic link auth plugin (`plugins/email/`) is removed
- [ ] Passport.js packages (`@outlinewiki/koa-passport` and related strategy packages) are removed from `package.json`
- [ ] Passport.js utilities (`server/utils/passport.ts`, `server/middlewares/passport.ts`) are removed
- [ ] The frontend login page no longer renders buttons or flows for removed providers
- [ ] The `/api/auth.config` endpoint only returns Microsoft OIDC as an available provider
- [ ] The application starts and runs without errors after removal

## Scope

### In scope

- Deleting all legacy auth plugin directories and their code
- Removing Passport.js and strategy packages from dependencies
- Removing Passport.js utility and middleware files
- Updating the frontend login scene to only show Microsoft SSO
- Updating the auth config API to reflect a single provider
- Removing any environment variable handling for deleted providers (GOOGLE_*, SLACK_*, AZURE_*, DISCORD_*, SMTP_* auth-related)

### Out of scope

- Modifying Better Auth configuration (established in Slice 1)
- Session/token migration (Slice 3)
- Database migration to drop legacy `authentication_providers` or `user_authentications` rows — data cleanup is a separate concern
- Removing the OAuth server (Outline as provider) — future work

## Technical notes

- The plugin system uses `PluginManager` to register auth providers. After removing plugins, verify that PluginManager does not error on missing registrations.
- The frontend login scene (`app/scenes/Login/`) dynamically renders provider buttons from the API config response. After this slice, it should only render the Microsoft SSO button.
- Check for any imports or references to removed plugins in shared code (e.g., `server/routes/api/auth/auth.ts`).
- The `server/utils/oauth.ts` abstract OAuth client may still be needed if Better Auth uses it, or may be removable — verify before deleting.

## Dependencies

- Slice 1 (`slice-01-better-auth-microsoft-oidc`) must be completed first — Microsoft OIDC login must be working before removing the legacy providers.

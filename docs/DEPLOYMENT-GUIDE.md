# Deploying IMC KMS on AWS (Apache + `/kms` sub-path)

Step-by-step runbook for IT to deploy the KMS (an Outline fork) on a bare-metal
AWS EC2 box, served under the **`/kms` sub-path** of the shared host
`https://appstpcid.imcpelilog.co.id/kms` — the same pattern as the sibling
**imc-clocka** app (`/clocka`).

> **Audience.** IT operators bringing up production. Local development is in
> [`README.md`](../README.md).

---

## 0. The one rule that matters most

The deploy sub-path is **derived from `URL` and baked into the build**.

```
URL=https://appstpcid.imcpelilog.co.id/kms   ->   BASE_PATH=/kms
URL=https://kms.imcpelilog.co.id             ->   BASE_PATH=""   (dedicated subdomain)
```

`BASE_PATH` is compiled into hashed asset URLs, the PWA manifest, and the
service-worker precache **at `yarn build` time**. Therefore:

- **`URL` must be identical at build time and runtime.** If they differ, every
  hashed asset 404s. The server now refuses to start (or logs a fatal error) on
  a build/runtime mismatch — see `server/utils/startup.ts` `checkBasePathParity()`.
- **Changing the sub-path requires a rebuild, not a restart.**

This is the KMS analogue of clocka's `NEXT_PUBLIC_BASE_PATH` foot-gun.

---

## 1. Architecture

```
        Internet
           │  https://appstpcid.imcpelilog.co.id/kms/*
           ▼
   ┌───────────────┐   TLS termination, forwards /kms/* unchanged
   │   Apache 2.4  │   (+ WebSocket upgrade for /kms/realtime, /kms/collaboration)
   └───────┬───────┘
           │  http://127.0.0.1:3100/kms/*
           ▼
   ┌───────────────┐   Node app (PM2 or systemd), owns the /kms prefix itself
   │   KMS server  │── PostgreSQL  (required)
   │  (port 3100)  │── Redis       (required)
   └───────────────┘── File storage (local dir or S3-compatible)
```

The app **owns its `/kms` prefix** (via `koa-mount(BASE_PATH)`); Apache only
forwards. Co-tenant apps live at other paths on the same host, so every proxy
rule is scoped to `/kms/`.

---

## 2. Prerequisites

- **Node.js ≥ 20.12** (or 22) and **Yarn 4** (`corepack enable`).
- **PostgreSQL** and **Redis** reachable from the box.
- **Apache 2.4** with modules: `proxy proxy_http proxy_wstunnel rewrite ssl headers deflate`.
- A **Microsoft Entra ID app registration** (client ID, secret, tenant ID) for SSO.
- Two generated secrets: `openssl rand -hex 32` (run twice, for `SECRET_KEY` and `UTILS_SECRET`).
- One generated `BETTER_AUTH_SECRET`: `openssl rand -base64 32`.

---

## 3. Step 1 — Get the code and configure env

```bash
sudo mkdir -p /opt/kms && cd /opt/kms
git clone <repo-url> .
cp .env.example .env
```

Edit `/opt/kms/.env`. The load-bearing values for a `/kms` sub-path deploy:

| Variable | Required | Build/runtime | Value |
|---|---|---|---|
| `NODE_ENV` | ✅ | both | `production` |
| `URL` | ✅ | **build + runtime (must match)** | `https://appstpcid.imcpelilog.co.id/kms` — the `/kms` path **is** the sub-path config |
| `PORT` | ✅ | runtime | `3100` (must match the Apache `proxy_pass` target) |
| `FORCE_HTTPS` | ✅ | runtime | `false` (Apache terminates TLS) |
| `SECRET_KEY` | ✅ | runtime | `openssl rand -hex 32` |
| `UTILS_SECRET` | ✅ | runtime | `openssl rand -hex 32` |
| `DATABASE_URL` | ✅ | runtime | `postgres://user:pass@host:5432/kms` |
| `REDIS_URL` | ✅ | runtime | `redis://127.0.0.1:6379` |
| `FILE_STORAGE` | ✅ | runtime | `local` (+ `FILE_STORAGE_LOCAL_ROOT_DIR=/opt/kms/data`) or `s3` (+ AWS_* keys) |
| `BETTER_AUTH_SECRET` | ✅ | runtime | `openssl rand -base64 32` |
| `MICROSOFT_CLIENT_ID` | ✅ | runtime | from Entra app registration |
| `MICROSOFT_CLIENT_SECRET` | ✅ | runtime | from Entra app registration |
| `MICROSOFT_TENANT_ID` | ✅ | runtime | IMC's Entra tenant ID |
| `SMTP_*` | optional | runtime | email (invites, notifications) |

> **Do NOT** put a real `URL` of `http://localhost:3100` into a production build.
> Whatever `URL` is set when you run `yarn build` is the sub-path that gets baked
> in.

---

## 4. Step 2 — Install, build, migrate

```bash
cd /opt/kms
corepack enable
yarn install --immutable
yarn build          # URL must already be set in .env — it is baked in here
yarn db:migrate     # apply database migrations
```

`yarn build` runs `vite build` (client, bakes `BASE_PATH`), i18n, and the server
bundle. It also writes `build/base-path.json` so the server can verify
build/runtime parity at startup.

(The `Makefile` wraps these: `make deploy` = `install build migrate restart`.)

---

## 5. Step 3 — Run the app

Pick **one** process manager.

### Option A — systemd (matches clocka; survives reboots)

```bash
sudo useradd --system --home /opt/kms --shell /usr/sbin/nologin kms
sudo chown -R kms:kms /opt/kms
sudo cp deploy/systemd/kms.service /etc/systemd/system/kms.service
sudo systemctl daemon-reload
sudo systemctl enable --now kms
journalctl -u kms -f          # watch it boot
```

### Option B — PM2

```bash
cd /opt/kms
make start                    # pm2 start ecosystem.config.cjs (app name "kms")
pm2 startup systemd && pm2 save   # survive reboots
```

Either way the app binds `127.0.0.1:3100` and serves the whole app under `/kms`.
The health check is at the **origin root** `/_health` (DB + Redis ping) — it is
NOT under `/kms`.

---

## 6. Step 4 — Apache reverse proxy

```bash
sudo a2enmod proxy proxy_http proxy_wstunnel rewrite ssl headers deflate
sudo cp deploy/apache/kms.conf /etc/apache2/sites-available/kms.conf
# paste real SSL cert paths into the file (or run: sudo certbot --apache)
sudo a2ensite kms
sudo apachectl configtest
sudo systemctl reload apache2
```

If the shared host is already served by an existing `<VirtualHost *:443>`, do
**not** add the whole file — paste only the block between the
`BEGIN/END kms proxy block` markers into that vhost.

The config forwards `/kms` unchanged (`ProxyPass /kms http://127.0.0.1:3100/kms`,
no trailing slash), upgrades WebSockets for `/kms/*`, 308-redirects bare `/kms`
→ `/kms/`, and sends `Cache-Control: no-cache` for `/kms/static/sw.js`.

---

## 7. Step 5 — Microsoft Entra SSO

In the Entra portal → **App Registrations** → your KMS app → **Authentication**,
add a **Web** redirect URI that **includes the sub-path**:

```
https://appstpcid.imcpelilog.co.id/kms/api/better-auth/callback/microsoft
```

Confirm the **Tenant ID** matches `MICROSOFT_TENANT_ID`. A missing `/kms` here is
the classic `AADSTS50011: redirect URI mismatch`.

---

## 8. Verification checklist

- [ ] `curl -fsS https://appstpcid.imcpelilog.co.id/_health` (root, no `/kms`) → `OK` 200.
- [ ] `https://appstpcid.imcpelilog.co.id/kms/` renders the login page, no console 404s for `/static/*` assets.
- [ ] Asset URLs in the page source are prefixed `/kms/static/...` (not bare `/static/...`).
- [ ] "Continue with Microsoft" signs in and lands back inside `/kms` (no redirect to the bare origin).
- [ ] Create a document, **upload an image** → it renders (not a broken-image icon). This exercises the attachment sub-path fix.
- [ ] Open the doc in a second browser → live collaboration/cursors work (WebSocket upgrade through Apache).
- [ ] Export a document (Settings → Export) → the download link works.
- [ ] PWA: "Add to Home Screen" installs and launches at `/kms/`.

---

## 9. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| **Every page/asset 404s** | `URL` differed between build and runtime, or Apache strips `/kms` | Rebuild with the correct `URL` (`yarn build`); confirm `ProxyPass` has NO trailing slash. The startup log will show a `Sub-path mismatch` fatal if the build/runtime `BASE_PATH` differ. |
| Server refuses to start: `BASE_PATH build/runtime mismatch` | Built with one `URL`, running with another | Set `URL` consistently, `yarn build`, restart. |
| Login → "redirect URI mismatch" (AADSTS50011) | Entra redirect URI missing `/kms` | Add `https://<host>/kms/api/better-auth/callback/microsoft` in Entra |
| Microsoft button does nothing / 404 on sign-in | Old build without the sub-path auth fix | Rebuild from this revision (`yarn build`) |
| Live collaboration / cursors don't sync | WebSocket upgrade not forwarded | Ensure `proxy_wstunnel` is enabled and the `RewriteRule … ws://…/kms/$1` block is present and scoped to `/kms/` |
| Document images show as broken | Old build, or an upstream proxy stripping `/kms` from `/kms/api/attachments.redirect` | Rebuild; confirm the edge forwards `/kms/api/*` unchanged |
| `/_health` returns 500 | DB or Redis unreachable | Check `DATABASE_URL` / `REDIS_URL`; the probe pings both |
| Stale UI after deploy | Browser cached old `sw.js` | The Apache `no-cache` rule on `/kms/static/sw.js` fixes this going forward; hard-refresh once |
| Orphaned root service worker on shared host | A prior root-scoped SW intercepts `/kms` | Optionally serve `deploy/root-sw-tombstone.js` at the origin root `/sw.js` for a transition window (read its header first) |

---

## 10. Day-to-day

```bash
# Update to a new revision
cd /opt/kms && git pull && yarn install --immutable && yarn build && yarn db:migrate
sudo systemctl restart kms        # or: pm2 restart kms

# Logs
journalctl -u kms -f              # systemd
pm2 logs kms                      # PM2
```

## 11. Reference

- [`deploy/apache/kms.conf`](../deploy/apache/kms.conf) — Apache reverse-proxy (canonical)
- [`deploy/systemd/kms.service`](../deploy/systemd/kms.service) — systemd unit
- [`deploy/root-sw-tombstone.js`](../deploy/root-sw-tombstone.js) — orphaned-SW evictor (optional)
- [`docs/apache-vhost.conf`](./apache-vhost.conf) — original annotated vhost (dual-layout notes)
- [`.env.example`](../.env.example) — full env var reference
- [`ecosystem.config.cjs`](../ecosystem.config.cjs) / [`Makefile`](../Makefile) — PM2 flow

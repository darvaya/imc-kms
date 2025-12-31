---
description: Start Outline KMS locally for development
---

# Start Outline KMS Locally

This workflow starts the Outline KMS application for local development.

## Prerequisites

Before starting, ensure these services are running:
- **PostgreSQL** (port 5432)
- **Redis** (port 6379)

// turbo
1. Check if PostgreSQL is running:
```bash
brew services list | grep postgres
```

// turbo
2. Check if Redis is running:
```bash
brew services list | grep redis
```

If they're not running, start them:
```bash
brew services start postgresql@14
brew services start redis
```

## Start the Application

// turbo
3. Navigate to the KMS directory and start the development server:
```bash
cd /Users/rihanrauf/Documents/00.\ Professional/IMC-Pelita-Logistik/KMS && \
export DATABASE_URL="postgres://rihanrauf@localhost:5432/outline" && \
export REDIS_URL="redis://127.0.0.1:6379" && \
export SECRET_KEY="e69c604a09d8d32656ae1d6fb77c6401475152de80b4a5cfc15da2bf48ab8f58" && \
export UTILS_SECRET="5759a8f2ab08ad8bf2fd75b9f17eea7e36cf5aa80bebb5482b0d91b6ee5a381a" && \
export URL="http://localhost:3000" && \
export FORCE_HTTPS="false" && \
export FILE_STORAGE="local" && \
export FILE_STORAGE_LOCAL_ROOT_DIR="./data" && \
corepack yarn dev:watch
```

4. Wait for the server to start (you'll see logs about routes being registered)

5. Open http://localhost:3000 in your browser

## Ports Used

| Service | Port | Description |
|---------|------|-------------|
| Backend | 3000 | Main application (API + SSR) |
| Frontend | 3001 | Vite dev server (hot reload) |
| Debugger | 9229 | Node.js debugger |

## Authentication

In development mode, **Email Magic Link authentication** is enabled automatically.
- Enter any email address to receive a verification code
- Check the terminal logs for the verification code (since SMTP is not configured)

## Stopping the Application

Press `Ctrl+C` in the terminal to stop the development server.

Or kill the processes using:
```bash
lsof -ti:3000,3001 | xargs kill -9
```

## Troubleshooting

### "Database does not exist" error
```bash
createdb outline
```

### "Redis connection refused" error
```bash
brew services start redis
```

### Build errors after pulling new code
```bash
corepack yarn install
corepack yarn build:server
```

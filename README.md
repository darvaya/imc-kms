# IMC Pelita Logistik KMS

<p align="center">
  <i>Internal knowledge management system for IMC Pelita Logistik.<br/>Built on Outline - a fast, collaborative knowledge base using React and Node.js.</i>
</p>

## About

IMC Pelita Logistik KMS is your team's shared library – a place for important documentation, SOPs, and knowledge to be stored and discovered. 

### Features

- **Real-time Collaboration** - Multiple users can edit documents simultaneously
- **Powerful Search** - Find anything instantly with CMD+K
- **Collections** - Organize documents by department or topic
- **Access Control** - Share with specific users or groups
- **Templates** - Create reusable document structures
- **Import/Export** - Bring in content from Notion, Confluence, and more

## Development

### Prerequisites

- Node.js 20.12+ or 22
- PostgreSQL
- Redis
- Yarn 4

### Local Setup

```bash
# Install dependencies
yarn install

# Run database migrations
yarn db:migrate

# Start development server
yarn dev:watch
```

See the [/start-local workflow](.agent/workflows/start-local.md) for detailed instructions.

## Deployment

**Primary target — AWS bare-metal under the `/kms` sub-path** (Apache + systemd/PM2),
the same pattern as the sibling imc-clocka app. Follow the step-by-step runbook:

- [`docs/DEPLOYMENT-GUIDE.md`](docs/DEPLOYMENT-GUIDE.md) — full IT runbook
- [`deploy/apache/kms.conf`](deploy/apache/kms.conf) — Apache reverse proxy
- [`deploy/systemd/kms.service`](deploy/systemd/kms.service) — systemd unit
- [`.env.example`](.env.example) — environment variables

The deploy sub-path is derived from `URL` (e.g. `URL=https://host/kms` → `/kms`)
and **baked into the build** — `URL` must match at `yarn build` and `yarn start`.

Railway is a secondary option (`railway.toml`, `.env.railway.example`).

## License

This software is based on [Outline](https://github.com/outline/outline) and is licensed under BSL 1.1.

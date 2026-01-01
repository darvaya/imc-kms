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

This application is configured for deployment on Railway. See `.env.railway.example` for required environment variables.

## License

This software is based on [Outline](https://github.com/outline/outline) and is licensed under BSL 1.1.

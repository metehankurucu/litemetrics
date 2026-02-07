# Self-Hosting

Insayt ships as a single Docker image. It bundles the server, dashboard, tracker script, and all API endpoints.

## Quick Deploy

### Railway (one click)

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/template/insayt?referralCode=insayt)

1. Click the button, add a ClickHouse service (or MongoDB)
2. Set `CLICKHOUSE_URL` (or `MONGODB_URL`) and `ADMIN_SECRET` env vars
3. Deploy

### Docker Compose (recommended)

```bash
git clone https://github.com/metehankurucu/insayt.git
cd insayt
ADMIN_SECRET=your-secret docker compose up -d
```

This starts ClickHouse and Insayt together with healthchecks and persistent volumes.

### Docker (standalone)

```bash
docker build -t insayt .
docker run -p 3002:3002 \
  -e CLICKHOUSE_URL=http://your-clickhouse:8123 \
  -e ADMIN_SECRET=your-secret \
  insayt
```

Open `http://localhost:3002` for the dashboard.

## What the container serves

| Path | Description |
|------|-------------|
| `/` | Dashboard UI |
| `/tracker.js` | Browser tracker script |
| `/insayt.js` | Same tracker (alias) |
| `/api/collect` | Event ingestion |
| `/api/stats` | Query analytics |
| `/api/events` | List events |
| `/api/users` | List users |
| `/api/sites` | Site management |
| `/health` | Health check endpoint |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DB_ADAPTER` | Database adapter (`clickhouse` or `mongodb`) | `clickhouse` |
| `CLICKHOUSE_URL` | ClickHouse connection URL | `http://localhost:8123` |
| `MONGODB_URL` | MongoDB connection string (when using mongodb adapter) | `mongodb://localhost:27017/insayt` |
| `ADMIN_SECRET` | Secret for admin login and site management | _(none)_ |
| `PORT` | Server port | `3002` |
| `GEOIP` | Enable GeoIP lookup | `true` |
| `TRUST_PROXY` | Trust X-Forwarded-For headers | `true` |

`DATABASE_URL` and `INSAYT_ADMIN_SECRET` also work as aliases.

## Using MongoDB Instead

To use MongoDB instead of ClickHouse, set `DB_ADAPTER=mongodb`:

```bash
docker run -p 3002:3002 \
  -e DB_ADAPTER=mongodb \
  -e MONGODB_URL=mongodb://your-mongo:27017/insayt \
  -e ADMIN_SECRET=your-secret \
  insayt
```

Or with Docker Compose, use the mongodb profile:

```bash
docker compose --profile mongodb up -d
```

## Nginx Reverse Proxy

```nginx
server {
    listen 80;
    server_name analytics.yoursite.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name analytics.yoursite.com;

    ssl_certificate /etc/letsencrypt/live/analytics.yoursite.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/analytics.yoursite.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3002;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## SSL with Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d analytics.yoursite.com
```

## ClickHouse Notes

For production:
- ClickHouse uses MergeTree for events (partitioned by month) and ReplacingMergeTree for sites
- Data is stored in named Docker volumes (`clickhouse_data`) and persists across container restarts/updates
- ClickHouse handles millions of events with sub-second query latency
- For backups, use `clickhouse-backup` tool

## MongoDB Notes

If using MongoDB adapter:
- Enable authentication: `MONGO_INITDB_ROOT_USERNAME` / `MONGO_INITDB_ROOT_PASSWORD`
- Set up backups with `mongodump`
- MongoDB Atlas free tier (512MB) handles ~10 apps with 1K users each
- For larger deployments, see [Scaling](./scaling.md)

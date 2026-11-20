# BSC Performance deployment

This stack is isolated from the CRM deployment on the same VPS.

- Its own PostgreSQL container and `bsc_pgdata` volume
- Its own API container
- Its own web container
- No host port 80/443 conflicts: it publishes only port `8081`
- `/api` is proxied by the web container to the API, so the browser uses one origin

## Prerequisites

- Docker Engine and Docker Compose on the VPS
- SSH access as `chadwick`
- Port `8081` allowed in the VPS firewall
- Cloudflare R2 buckets for this project

## 1. Clone the repository

```bash
sudo mkdir -p /srv/bsc-performance
sudo chown "$USER":"$USER" /srv/bsc-performance
git clone <repository-url> /srv/bsc-performance
cd /srv/bsc-performance
```

## 2. Create the environment file

```bash
cp deploy/.env.example deploy/.env
openssl rand -hex 32
```

Put the generated value into `JWT_SECRET`. Set `POSTGRES_PASSWORD` to a long URL-safe password. Keep `BSC_PUBLIC_URL=http://217.76.49.154:8081` until a domain is available.

Create **new** Cloudflare R2 buckets, for example `bsc-documents` and `bsc-knowledge-hub`, and a token scoped to those buckets. Do not point this stack at the CRM buckets.

Allow this browser origin in each R2 bucket's CORS policy, for example:

```json
[
  {
    "AllowedOrigins": ["http://217.76.49.154:8081"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Update that origin when the domain is added.

## 3. Start the stack

```bash
cd /srv/bsc-performance
docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d --build
```

The API container runs `prisma migrate deploy` before starting, so the new database is initialized on first boot.

Check:

```bash
docker compose --env-file deploy/.env -f deploy/docker-compose.yml ps
docker compose --env-file deploy/.env -f deploy/docker-compose.yml logs -f api
curl http://127.0.0.1:8081/health
```

Open:

```text
http://217.76.49.154:8081
```

## 4. Seed initial test users

Use a disposable/test database only:

```bash
docker compose --env-file deploy/.env -f deploy/docker-compose.yml exec api npm run seed
```

Seeded users use `Password123!`. Use the HR or super-admin account to test employee onboarding, then change the passwords.

## 5. Backups

```bash
chmod +x deploy/backup-db.sh
sudo mkdir -p /srv/bsc-backups
sudo chown "$USER":"$USER" /srv/bsc-backups
./deploy/backup-db.sh
```

Add a nightly cron entry after verifying the script.

## 6. Later: add the domain

When DNS is ready:

1. Point the domain to `217.76.49.154`.
2. Add a Caddy site block for the domain that reverse-proxies to the `web` container, or keep using port `8081`.
3. Set `BSC_PUBLIC_URL` to the new HTTPS origin.
4. Rebuild the web image so `VITE_API_URL` changes:

```bash
docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d --build web
```

Because `/api` is same-origin, the API base path does not need to change beyond the public URL.

# ratio-backup-api (Railway + Postgres)

This is a small HTTP API used by the app “账号云备份” mode. It stores backups in Railway Postgres.

## Deploy (Railway)

1) Create a new Railway service from this repo, and set **Root Directory** to `server`.
2) Add / link a Railway Postgres database to the service.
3) Set env vars:
   - `DATABASE_URL`: your Railway Postgres connect URL (keep it secret)
   - `JWT_SECRET`: a long random string
   - `CORS_ORIGIN` (optional): comma-separated allowed origins (example: `http://localhost:5173,https://<user>.github.io`)
   - `PGSSL` (optional): set to `true` if your Postgres requires TLS (default: enabled in production)
4) Deploy.

## Local run

```bash
cd server
npm i
set DATABASE_URL=postgres://...
set JWT_SECRET=dev-secret
npm run dev
```

## App setup

In the app Settings:
- Select **云备份 → 账号**
- Fill **账号服务地址** with your deployed API base URL (example: `https://<service>.up.railway.app/`)
- Register / Login, then it will auto-backup after each change.

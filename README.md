# Salaam Car Rental - Production-Ready Full-Stack App

## Overview
This project is now a full-stack car rental management system with:
- API-backed authentication and session validation
- Real backend CRUD for fleet, customers, bookings, transactions, and settings
- Dashboard metrics and charts driven by live backend data
- Form validation on both frontend and backend
- Error/success/loading feedback across pages
- Protected routes and logout flow

Default login:
- `admin@salaam.com`
- `admin`

## Architecture
### Frontend (`src/`)
- `pages/` feature pages: dashboard, fleet, bookings, customers, finance, settings, login
- `components/` reusable UI modules
- `lib/api.ts` API client with auth token handling
- `lib/auth.ts` auth state helpers
- `types/models.ts` shared app domain types

### Backend (`backend/`)
- `server/app.js` Express API server bootstrap
- `server/routes/` route registration
- `server/controllers/` request handlers
- `server/middleware/` auth/RBAC/validation middleware
- `server/services/` domain/security helpers
- `server/db/` PostgreSQL pool, migrations, and legacy seed import
- `db.json` one-time legacy seed source

## API Endpoints
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /api/dashboard`
- CRUD:
  - `/api/cars`
  - `/api/customers`
  - `/api/bookings`
  - `/api/transactions`
- Settings:
  - `GET /api/settings`
  - `PUT /api/settings`

## Run Locally
1. Install dependencies:
```bash
npm install
```

2. Configure PostgreSQL connection (choose one approach):
- `DATABASE_URL=postgres://postgres:password@localhost:5432/salaam_car_rental`
- or individual vars: `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`
  - easiest: copy `.env.example` to `.env` and set values

3. Start backend API:
```bash
npm run server
```

4. In a second terminal, start frontend:
```bash
npm run dev
```

Frontend URL:
- `http://localhost:5173`

Backend URL:
- `http://localhost:4000`

## Build and Lint
```bash
npm run lint
npm run typecheck
npm run build
```

## API Documentation
- OpenAPI spec: `GET /api/openapi.json`
- Docs UI (ReDoc): `GET /api/docs`

## Environment Configuration
Optional frontend API override:
- `VITE_API_BASE_URL=http://localhost:4000/api`

If omitted, frontend defaults to `http://localhost:4000/api`.

Additional backend controls (see `.env.example`):
- `SESSION_TTL_HOURS`
- `LOGIN_RATE_LIMIT_WINDOW_MS`
- `LOGIN_RATE_LIMIT_MAX_REQUESTS`
- `LOGIN_ATTEMPT_WINDOW_MS`
- `LOGIN_MAX_ATTEMPTS`
- `LOGIN_LOCKOUT_MS`
- `PASSWORD_RESET_TOKEN_TTL_MINUTES`
- `APP_BASE_URL`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

Password reset email notes:
- Configure SMTP variables to send real reset emails from `POST /api/auth/forgot-password`.
- In development, if SMTP is not configured, the API returns a temporary `resetUrl` in the response for testing.

## Operations
Use one backend process manager in production (PM2 or systemd), not multiple concurrent `npm run server`.

Database backup/restore scripts:
```bash
npm run db:backup
npm run db:restore -- -BackupFile backups/salaam-YYYYMMDD-HHMMSS.dump
```

## CI
GitHub Actions workflow: `.github/workflows/ci.yml`

Pipeline gates:
- lint
- typecheck
- API integration tests
- production build

## Notes
- Data now persists in normalized relational tables (`users`, `roles`, `cars`, `customers`, `bookings`, `payments`, `expenses`, `branches`, `audit_logs`, `sessions`, `settings`).
- On first start, migrations are applied automatically and legacy data is imported from `backend/db.json`/`app_state` when present.
- Security middleware includes `helmet`, `cors`, `morgan`, bcrypt-based password storage, and role-based access control.

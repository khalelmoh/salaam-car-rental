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
- `server.js` Node HTTP API server
- `db.js` JSON file persistence layer
- `db.json` persisted data store (seed + runtime data)

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

2. Start backend API:
```bash
npm run server
```

3. In a second terminal, start frontend:
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
npm run build
```

## Environment Configuration
Optional frontend API override:
- `VITE_API_BASE_URL=http://localhost:4000/api`

If omitted, frontend defaults to `http://localhost:4000/api`.

## Notes
- Data persists in `backend/db.json`.
- Session tokens are persisted in `backend/db.json` and validated by `Authorization: Bearer <token>`.
- The current implementation is modular and ready for migration from JSON persistence to a database layer (PostgreSQL/MySQL/MongoDB) without changing frontend contracts.

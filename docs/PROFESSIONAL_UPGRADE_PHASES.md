# Professional Upgrade Phases

This repository now includes concrete upgrades across six phases:

## Phase 1: Stability
- Environment validation at startup (`backend/server/config/env.js`)
- Session TTL configurable via env (`SESSION_TTL_HOURS`)
- Backup/restore scripts (`scripts/db-backup.ps1`, `scripts/db-restore.ps1`)
- Production start script (`npm run start:prod`)

## Phase 2: API Contract and Correctness
- OpenAPI endpoint (`/api/openapi.json`)
- API docs UI (`/api/docs`)
- Integration test for paid-only booking revenue recognition

## Phase 3: Security
- Login IP rate limiting
- Failed-attempt lockout policy
- Standardized auth/authorization error codes

## Phase 4: Database Quality
- Additional indexes for common booking/payment/session query paths

## Phase 5: Observability
- Request ID propagation (`x-request-id`)
- Structured JSON HTTP logs with request ID and latency
- Error responses now include `requestId`

## Phase 6: Delivery Pipeline
- GitHub Actions CI with Postgres service
- Lint, typecheck, integration tests, and build as release gates

# Changes from upstream OpenMAIC (THU-MAIC/OpenMAIC)

This fork is maintained by Gigabox Research under the same AGPL-3.0 license
as the original project. All modifications are clearly listed below.

Original copyright: Copyright (c) THU-MAIC
Fork maintainer: Gigabox Research (https://gigabox.ai)
Upstream: https://github.com/THU-MAIC/OpenMAIC

---

## v0.3.0 — User Identity + Progress Tracking (2026-05-17)

### Added
- **User authentication** via magic link email (replaces single ACCESS_CODE)
  - `iron-session` encrypted cookies for stateless sessions
  - Magic link login via Resend transactional email
  - API key authentication (`gbox_pk_*` format) for programmatic access
  - Login page with email + API key tabs
- **Per-user progress tracking** backed by PostgreSQL
  - Classroom progress (current scene, completion state)
  - Scene-level completion tracking
  - Progress restore on classroom load
- **PostgreSQL integration** for user and progress data
  - Per-instance database (`maic_{slug}`) on Cloud SQL
  - Auto-migration on startup
- **Multi-tenant hosting adjustments**
  - Updated provisioning to create per-instance databases
  - `AUTH_MODE` env var: `magic-link` (default) or `access-code` (legacy fallback)

### Modified files
All modified files carry the header: `// Modified by Gigabox Research (2026)`

| File | Change |
|------|--------|
| `middleware.ts` | Added magic-link/session auth path alongside ACCESS_CODE |
| `app/layout.tsx` | Conditional auth guard based on AUTH_MODE |
| `app/page.tsx` | User greeting + logout button |

### New files
| File | Purpose |
|------|---------|
| `CHANGES.md` | This file |
| `app/login/page.tsx` | Login page (magic link + API key) |
| `app/api/auth/magic-link/route.ts` | Send magic link email |
| `app/api/auth/verify/route.ts` | Verify token, create session |
| `app/api/auth/logout/route.ts` | Clear session |
| `app/api/auth/api-key-login/route.ts` | API key login |
| `app/api/auth/me/route.ts` | Current user info |
| `app/api/progress/route.ts` | GET + POST progress tracking |
| `lib/auth/session.ts` | iron-session configuration |
| `lib/auth/middleware.ts` | Auth check utility for API routes |
| `lib/auth/api-keys.ts` | API key hash + lookup |
| `lib/db/pool.ts` | PostgreSQL connection pool |
| `lib/db/migrate.ts` | Migration runner |
| `lib/db/queries.ts` | Typed query functions |
| `migrations/001_users_and_progress.sql` | Schema DDL |

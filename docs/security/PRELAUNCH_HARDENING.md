# Prelaunch Hardening & Shared Contracts (#36, #83)

## 1. Admin Mutation Limiter (`backend/src/middleware/security.ts`)
- **Export**: `adminMutationLimiter`
- **Rate Limit Window**: 60 seconds (1 minute).
- **Limit**: 60 mutation requests per minute.
- **Skip Condition**: Skips safe read methods (`GET`, `HEAD`, `OPTIONS`).
- **Key Generator**: Actor-based rate limiting keyed by `admin_${req.superAdmin.id}` with safe IP fallback (`req.ip || 'unknown'`).
- **Response**: Returns HTTP 429 `{ error: 'RATE_LIMITED', message: 'Thao tác quản trị quá nhanh. Vui lòng thử lại sau.' }` with standard Draft-8 `Retry-After` headers.

## 2. Prelaunch Form Defaults (`frontend/src/pages/admin/AdminLogin.tsx`)
- Removed all hardcoded credentials from React state (`email = ''`, `password = ''`).
- Updated placeholder from real credentials to generic `admin@example.com` / `••••••••`.
- Removed visible demo credential card from login form footer.

## 3. Transaction-Aware Audit Helper (`backend/src/utils/audit.ts`)
- **Export**: `recordAuditLog(entry: AuditLogInput, client?: PoolClient): Promise<void>`
- **Automatic Redaction**: Automatically scans and masks sensitive fields (`password`, `token`, `secret`, `hash`, `cookie`, `credential`, `authorization`, `privateKey`, `apiKey`) to `[REDACTED]`.
- **Transaction Safety**: Supports optional `PoolClient` parameter to participate in atomic database transactions. If the transaction rolls back, audit logs roll back cleanly.

## 4. Malformed JSON Body Protection (`backend/src/app.ts`)
- Generic 400 `BAD_REQUEST` error response for syntax errors in JSON body parsing.
- Does not expose stack traces, parser internals, or raw payloads in HTTP response or central error logs.

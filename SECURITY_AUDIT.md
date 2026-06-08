# SECURITY AUDIT

Open P0 count: 0.

Resolved:
- Production refuses to run without `MONGODB_URI`.
- Production refuses to run without `JWT_SECRET`.
- Super admin login requires `SUPER_ADMIN_PASSWORD_HASH` in production.
- Tenant resource update APIs use allowlisted, validated fields.
- Auth token creation fails closed when persisted user IDs are missing.
- Security headers are configured in `proxy.ts`.


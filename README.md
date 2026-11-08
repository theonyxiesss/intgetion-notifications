# INTGETION Notifications Service

Notification core for INTGETION JOB LIST: the catalog of notification types and their payloads, the in-app inbox, per-type channel preferences, the email outbox sent through Resend (with hourly batching and unsubscribe links), and Telegram delivery.

Runs as its own HTTP process with its own tables and migrations. Developed separately; the platform is not wired to it yet.

Morning and employer briefs, the matches digest and the brief admin are **not** here. They read jobs, applications, matching and companies, and stay in the platform until those modules are extracted; they will use this service to deliver.

## Run

```bash
npm install
cp .env.example .env   # fill in values
npm run migrate        # notification tables only
npm run dev            # http://localhost:4050
```

Checks: `npm run typecheck`, `npm test`. Integration tests run only when `DATABASE_URL` is set (and need `DATABASE_MIGRATION_URL`).

Without `RESEND_API_KEY` emails are marked `skipped` and nothing leaves the process. Without `TELEGRAM_BOT_TOKEN` the Telegram task answers `{ disabled: true }`.

## How callers talk to it

Every request except `GET /health` needs `Authorization: Bearer <NOTIFICATIONS_SERVICE_TOKEN>`. Inbox routes need `x-user-id`. Answers are `cache-control: no-store`. Errors are `{ "error": { "code", "message", "details?" } }`.

## API

| Method | Path | Who | What |
|---|---|---|---|
| GET | `/health` | — | `{ ok }` |
| GET | `/v1/me/notifications?cursor&limit` | person | inbox page (limit ≤ 50) |
| GET | `/v1/me/notifications/unread-count` | person | `{ unread }` |
| POST | `/v1/me/notifications/read` | person | `{ ids? , all? }` |
| GET | `/v1/me/preferences` | person | every type × channel with `enabled` |
| PUT | `/v1/me/preferences` | person | `{ items: [{ type, channel, enabled }] }` |
| POST | `/v1/unsubscribe` | link | `{ token }` from an email; turns that email type off |
| POST | `/v1/notify` | module | `{ type, recipientIds, payload, email? }`; payload checked against the type |
| GET | `/v1/jobs/:id/expiring-notice` | module | `{ sent }` — was `job.expiring` already sent |
| POST | `/v1/tasks/dispatch-emails` | scheduler | send due emails, drop old read notices |
| POST | `/v1/tasks/dispatch-telegram` | scheduler | push allowed notices to linked Telegram accounts |

## What it calls

Platform at `PLATFORM_URL`, with `Authorization: Bearer <PLATFORM_CALLBACK_TOKEN>`:

| Method | Path | Answer |
|---|---|---|
| GET | `/api/internal/notifications/login-email?authUid` | `{ email }` from the auth provider |

This keeps the auth provider's admin key out of this service.

## Data

Tables owned by notifications: `notifications`, `notification_preferences`, `notification_emails`, type `notification_channel`. Migrations in `migrations/` (`0013`, `0025`, and the final email-locale list from platform `0034`–`0045`), applied by `npm run migrate`, tracked in `notifications_schema_migrations`. Safe to run again on a live database (checked against a non-superuser owner with rows present).

Reads platform tables (read-only): `users` (`auth_uid`, `status`, `locale`) and `telegram_accounts` (`telegram_id`). Telegram dispatch claims notices in one locked update joined to them. Needs the helper `public.enable_rls_deny_all` and roles `app_rw`, `anon`, `authenticated`. CI creates stand-ins from `test/sql/platform-stub.sql`.

Message texts come from the platform catalogs copied into `src/i18n/messages` (all seven languages).

## Packages inside

- `.` — catalog, `notify`, inbox, preferences, dispatch, render, `setNotificationsPorts`; in-process use can deliver inside a transaction (`deliverInTransaction`)
- `./ports` — `setNotificationsPorts()`
- `./server` — `createApp()` HTTP handler

Depends on `@intgetion/kit` (v0.3.0) by git tag.

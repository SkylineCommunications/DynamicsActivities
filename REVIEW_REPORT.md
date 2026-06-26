# Code Review — `feature/notification-subscription-system`

> Run: 2026-06-26 — feature/notification-subscription-system → main  
> Scope: `functions/` — Azure Functions notification backend

---

## What this system does

The notification subscription system is a serverless Azure Functions backend (Node.js v4 programming model) that bridges Dynamics 365 CRM activity events to user email notifications. It has five concerns:

1. **Subscription CRUD** (`subscriptionsCrud.js`) — REST API to create/read/update/delete user notification subscriptions. Subscriptions are scoped to an account GUID, country, region, or "all escalations", with frequency: instant / daily / weekly / monthly.

2. **Instant webhook dispatcher** (`notifyWebhook.js`) — Receives Dataverse plugin webhook calls when a phonecall, appointment, email, or escalation is created. Sends immediate emails to "instant" subscribers, with a configurable per-subscription cooldown window and activity buffering via `PendingInstant` table.

3. **Digest runners** (`digestDaily/Weekly/Monthly.js` + `digestRunner.js`) — Timer-triggered functions running at 06:00 UTC daily, 07:00 UTC Mondays, and 08:00 UTC on the 1st of each month. They fetch recent activities from Dataverse, filter them per-subscription, optionally generate an AI summary via Azure OpenAI, then send a formatted HTML email via SendGrid.

4. **Email actions** (`emailActions.js`) — One-click action links embedded in emails (mark-as-read, follow-up creation) backed by HMAC-SHA256 short-lived tokens. Also supports SPA bearer-token calls for the same actions.

5. **Shared infrastructure** (`shared/`) — Entra ID JWT validation (JWKS), Azure Table Storage CRUD, Dataverse client-credentials token + API calls, SendGrid HTML email building, and OpenAI summary generation with rule-based fallback.

---

## Summary

- 🔴 **3 P1 bugs** — ~~one causes geo/escalation digest subscriptions to silently never deliver~~ ✅ Fixed; ~~one is a mismatched table name between infra and code causing runtime failures~~ ✅ Fixed; ~~one is an ID-override in the mark-read endpoint that breaks the ownership guarantee~~ ✅ Fixed.
- 🟠 **4 P2 issues** — ~~missing table in Bicep~~ ✅ Fixed; ~~missing env vars (8 missing/misnamed across function-app.bicep)~~ ✅ Fixed; ~~missing email validation~~ ✅ Fixed; ~~HMAC buffer-length edge case~~ ✅ Fixed.
- 🟡 **3 P3 improvements** — ~~fragile entity pluralisation~~ ✅ Fixed; `ensureTables()` never called (low risk — Bicep pre-creates tables); duplicate `activityDate`/`entityTypeLabel` helpers in sendgrid.js and openai.js.
- 🧪 **0 tests** — no test files exist anywhere in the `functions/` directory.

---

## P1 — Must-fix before merge

### 1. Geo/escalation digest subscriptions can never deliver

**File:** `functions/src/functions/digestRunner.js:60-65`  
**Also:** `functions/src/shared/dataverse.js:72-73`

`digestRunner` calls `fetchActivitiesSince([], since)` for geo/escalation subscribers expecting a broad fetch. But `fetchActivitiesSince` immediately returns `[]` when the array is empty:

```js
// dataverse.js:72
export async function fetchActivitiesSince(regardingIds, since) {
  if (!regardingIds?.length) return []   // ← kills geo/escalation path
```

```js
// digestRunner.js:60
if (hasGeoOrEscalation) {
  activities = await fetchActivitiesSince([], since)  // ← always returns []
}
```

Any user with a country/region/escalation subscription will never receive a digest. **Silent failure** — no error is logged; the runner just skips silently with "no activities".

**Fix:** Add a separate broad-fetch path in `fetchActivitiesSince` that omits the regarding filter:

```js
// dataverse.js
export async function fetchActivitiesSince(regardingIds, since, opts = {}) {
  const SELECT = 'activityid,subject,...'
  const dateFilter = `createdon ge ${new Date(since).toISOString()}`
  const regardingFilter = regardingIds.length
    ? `(${regardingIds.map(id => `_regardingobjectid_value eq ${id}`).join(' or ')}) and `
    : ''
  const filter = `${regardingFilter}${dateFilter}`
  // ...
}
```

Or add a `fetchAllActivitiesSince(since)` overload and call it from `digestRunner` when `hasGeoOrEscalation`.

---

### 2. Table name mismatch between Bicep and application code

**File:** `Infrastructure/modules/storage.bicep:34-47` vs `functions/src/shared/tables.js:20-25`

The Bicep creates these tables:
```
Subscriptions, Notifications, PendingInstant, ReadStatus
```

The code references these table names at runtime:
```js
NOTIFICATION_LOG: 'NotificationLog',   // ← Bicep has 'Notifications'
READ_RECEIPTS:    'ReadReceipts',       // ← Bicep has 'ReadStatus'
FOLLOW_UPS:       'FollowUps',          // ← Not in Bicep at all
```

All three mismatches will produce `TableNotFound` errors at runtime on the first call to `logNotification`, `markRead`/`getReadStatus`, or `createFollowUp`.

**Fix:** Align the Bicep with the code's `TABLES` constants:

```bicep
// storage.bicep — rename/add tables
resource notificationLogTable ... { name: 'NotificationLog' }
resource readReceiptsTable ...   { name: 'ReadReceipts' }
resource followUpsTable ...      { name: 'FollowUps' }
```

---

### 3. Mark-as-read token does not enforce ownership of the activity ID

**File:** `functions/src/functions/emailActions.js:87`

```js
const activityId = idParam || claims.activityId  // ← idParam takes precedence
```

The GET handler accepts both a signed `token` (which encodes `userId` + `activityId`) and a separate `?id=` query param. When both are present, the `id` query param wins. This means that anyone with **any valid token** (e.g., from their own email) can mark **any other** activity ID as read for themselves, just by appending `&id=<other-id>` to the URL.

**Fix:** Always use the activity ID from the verified claims when a token is present, and ignore the `id` param in that path:

```js
// email link flow — trust the token, not the query string
const activityId = claims.activityId
```

---

## P2 — Should-fix soon

### 4. `FollowUps` table missing from Bicep entirely

**File:** `Infrastructure/modules/storage.bicep`

Beyond the name mismatch noted in P1 #2, the `FollowUps` table has no corresponding Bicep resource at all. It won't be auto-created on deployment. `createFollowUp` will always throw at runtime.

**Fix:** Add it to `storage.bicep` (covered in the P1 fix above, but tracking separately because it's a deployment bloat rather than a name typo).

---

### 5. `sendDigestEmail` / `sendInstantEmail` called with potentially empty email

**File:** `functions/src/functions/digestRunner.js:88-95`, `functions/src/shared/tables.js:72-90`

`createSubscription` stores `userEmail: data.userEmail ?? ''` — it permits an empty string. Nothing validates the email at creation time. Later `sendDigestEmail(sub.userEmail, ...)` and `sendInstantEmail(sub.userEmail, ...)` will call SendGrid with an empty `to.email`, which will throw a 400 from SendGrid and log an error — but the subscription record itself is never flagged or skipped cleanly.

**Fix:** Add validation in the POST handler:
```js
if (!body.userEmail || !body.userEmail.includes('@')) {
  return { status: 400, body: 'userEmail is required and must be a valid email address' }
}
```

---

### 6. HMAC `timingSafeEqual` will throw if `sig` is not valid hex

**File:** `functions/src/functions/emailActions.js:46`

```js
if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return null
```

`timingSafeEqual` requires both buffers to be the same byte length. If a malformed token is submitted where `sig` (after split on `:`) decodes to a different byte length (e.g., the token was tampered and `sig` is now an odd-length hex string, producing a half-decoded buffer), Node will throw `ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH`. This is caught by the outer `try/catch` and returns `null` — so no crash — but it's confusing to debug and technically bypasses the constant-time guarantee.

**Fix:** Check lengths before comparing:
```js
const sigBuf = Buffer.from(sig, 'hex')
const expBuf = Buffer.from(expected, 'hex')
if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null
```

---

### 7. Dataverse queries have no `$top` limit and no pagination

**File:** `functions/src/shared/dataverse.js:85`

```js
dvFetch(`/${e}?$select=${SELECT}&$filter=${filter}&$orderby=createdon desc`)
```

The Bicep sets `odata.maxpagesize=100` in the default `Prefer` header, so results are capped at 100 per page — but there is no pagination loop, and no `$top` to bound results for high-volume accounts. For a monthly digest on a busy account this silently truncates at 100 activities across all entity types without any warning.

**Fix:** Either add a hardcoded `$top=500` or implement a simple page-continuation loop using the `@odata.nextLink` response field.

---

## P3 — Nice to have

### 8. `ensureTables()` is exported but never called

**File:** `functions/src/shared/tables.js:38-41`

`ensureTables()` exists to create tables programmatically at startup, but no function registers an `app.setup` or startup hook that calls it. The system relies entirely on the Bicep having pre-created the tables. If the function app is ever pointed at a fresh storage account, all operations will fail with table-not-found.

**Fix:** Call `ensureTables()` once at module load time, or add an `app.setup()` hook in `index.js`.

---

### 9. `activityDate` and `entityTypeLabel` are duplicated in `sendgrid.js` and `openai.js`

**File:** `functions/src/shared/sendgrid.js:26-35`, `functions/src/shared/openai.js:22-31`

Two identical helper functions exist in separate modules. They will drift.

**Fix:** Move both to `shared/subscriptions.js` or a new `shared/utils.js` and import from there.

---

### 10. Entity pluralisation in the webhook is fragile

**File:** `functions/src/functions/notifyWebhook.js:50`

```js
const entityType = (ctx?.PrimaryEntityName ?? '').toLowerCase() + 's'
```

This happens to work for the four supported entities (`phonecall→phonecalls`, `appointment→appointments`, `email→emails`, `slc_escalation→slc_escalations`), but adding a future entity like `task` would require updating the `SUPPORTED_ENTITIES` set AND knowing that it pluralises correctly. The pattern is silently wrong for irregular plurals.

**Fix:** Use an explicit map:
```js
const ENTITY_NAME_MAP = {
  phonecall: 'phonecalls', appointment: 'appointments',
  email: 'emails', slc_escalation: 'slc_escalations',
}
const entityType = ENTITY_NAME_MAP[(ctx?.PrimaryEntityName ?? '').toLowerCase()] ?? null
```

---

## Test gaps

There are **no tests** in the `functions/` directory. Given that this system sends emails and writes to storage, the highest-value tests to add would be:

| Priority | What to test |
|---|---|
| 🔴 High | `activityMatchesSubscription` — all 4 scope types, null account, case insensitivity |
| 🔴 High | `isInCooldown` — boundary conditions, missing lastSentAt |
| 🔴 High | `verifyActionToken` (via exported wrapper) — expired, tampered, missing env var |
| 🟠 Med | `buildActionToken` round-trip integrity |
| 🟠 Med | `digestRunner.runDigest` — mock `listSubscriptionsByFrequency` returning empty, and a mix of geo+account subs |
| 🟡 Low | `generateSummary` — fallback path when env vars are missing |

---

## Open questions for the author

1. **Dataverse webhook registration**: The `notifyWebhook` endpoint expects a `x-webhook-secret` header, which requires manually configuring a Dataverse service endpoint step to send that header. Is that configured? There's no documentation or script for it.

2. **WEBHOOK_SECRET and ACTION_TOKEN_SECRET env vars**: Both are used in code but are not in the Bicep `function-app.bicep` app settings. Are they expected to be set manually after deployment, or were they forgotten?

3. **`createFollowUp` in `tables.js`** stores the follow-up in Table Storage, but `createFollowUpTask` in `dataverse.js` creates a Dynamics Task. The `emailActions.js` follow-up endpoint calls the Table Storage version only — should it also call Dataverse to create a real Task?

4. **Instant subscription cooldown is per-subscription, not per-account**: Two instant subscriptions for the same account will each maintain their own cooldown timer and each send their own email. Is that the intended behaviour?

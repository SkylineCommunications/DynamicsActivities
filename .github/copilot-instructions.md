# Copilot Instructions — DynamicsActivities

## What This App Is

A React + Vite SPA that replaces a Power App for logging customer interactions. It stores notes as native Dynamics 365 Activities and is deployed on DataMiner at:

```
https://solutionsdma-skyline.on.dataminer.services/public/DynamicsActivities/
```

Runs inside a DataMiner iframe. All auth uses popup flows — redirect flows do not work in iframes.

---

## Stack

- React 18 + Vite 5, static build only
- `@azure/msal-browser` + `@azure/msal-react` for Entra popup auth
- Dataverse Web API v9.2 for all data
- Microsoft Graph API v1.0 for calendar events (attendee prefill)
- Skyline dark design system (CSS custom properties, Inter font)

---

## Build Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server — uses `.env` |
| `npm run build` | Production build → `dist-dataminer/` — uses `.env.dataminer` |
| `npm run build:local` | Local build → `dist/` — uses `.env` |

**Always run `npm run build` (not `build:local`) before deploying.**

### Versioning for Deployment

A new deployment package requires a version bump. Update **both** files before creating a PR:

1. `package.json` → `"version"` field
2. `DynamicsActivitiesPackage/DynamicsActivitiesPackage/DynamicsActivitiesPackage.csproj` → `<Version>` and `<VersionComment>`

Use semver: patch for fixes, minor for features, major for breaking changes.

---

## Environment Variables

`.env` — local dev, client `acd01a7c-7c83-4977-a98d-ade9e82ae6e8`
`.env.dataminer` — DataMiner deployment, client `31b6b722-e159-43bd-a53b-1a450bf5b38c`

Key variables:
```
VITE_DATAVERSE_URL=https://skyline365-qa.crm4.dynamics.com/
VITE_CLIENT_ID=...
VITE_TENANT_ID=5f175691-8d1c-4932-b7c8-ce990839ac40
VITE_REDIRECT_URI=...
```

---

## Data Model

**Native Dynamics 365 activity entities plus one custom activity:**

| Type | Entity table | `_entityType` value |
|---|---|---|
| Phone Call | `phonecalls` | `phonecalls` |
| Appointment | `appointments` | `appointments` |
| Email | `emails` | `emails` |
| Escalation | `slc_escalations` | `slc_escalations` |

`createActivity` writes to the correct entity table based on type.

### Escalation entity & business rules

See the **dataverse-api** skill for the full `slc_escalation` entity schema, account escalation fields (`slc_activeescalationcount`, `slc_inescalation`), and business rules.

App-specific behavior:
- **Auto-link default** — The UI auto-checks "Link to escalation" when an active escalation is detected for the selected account. Users can uncheck to link directly to the account instead.

---

## Known Dataverse Constraints

- **`$expand` + `$top` on the same query causes HTTP 400 (`0x80060888`)**. Use `Prefer: odata.maxpagesize=100` instead of `$top` when expanding activity parties.
- Activity party skip masks: phonecalls/emails skip 1+9 (sender+owner), appointments skip 7+9 (organizer+owner).
- `noteDate()` falls back: `scheduledstart || scheduledend || actualend || createdon`.

---

## Auth Pattern

Popup-only. Never use `loginRedirect` (breaks inside DataMiner iframe).

```js
// Initial login
instance.loginPopup(loginRequest)

// Token acquisition
msalInstance.acquireTokenSilent(request)
  .catch(() => msalInstance.acquireTokenPopup(request))
```

Call `handleRedirectPromise()` at startup for resilience, but the primary flow is popup.

---

## Key Source Files

| File | Purpose |
|---|---|
| `src/api/dataverse.js` | All Dataverse ops — auth, search, create, delete |
| `src/api/graph.js` | Graph calendar fetch for attendee prefill |
| `src/components/AuthGuard.jsx` | Popup login, WhoAmI, render-prop auth gate |
| `src/components/QuickNoteForm.jsx` | Note creation (3 types, account/attendee pickers, calendar fill) |
| `src/components/NotesList.jsx` | Browse view — lazy server-side OData filters |
| `src/components/AutocompletePicker.jsx` | Debounced autocomplete with clearOnPick support |
| `src/components/CalendarPicker.jsx` | Graph calendar modal (60d past + 30d future, no all-day) |
| `src/styles/main.css` | Skyline design system CSS variables + component styles |
| `public/web.config` | IIS SPA rewrite rule for DataMiner/IIS hosting |

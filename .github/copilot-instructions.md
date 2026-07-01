# Copilot Instructions — DynamicsActivities

## What This App Is

A React + Vite SPA deployed as a **DataMiner Custom App** for logging customer interactions. It stores notes as native Dynamics 365 Activities and is deployed on the Solutions DMA at:

```
https://solutionsdma-skyline.on.dataminer.services/public/DynamicsActivities/
```

Users access it via DataMiner's `/auth/` page, which handles Entra sign-in and sets session cookies before redirecting to the app.

---

## Versioning & Deployment

**Every PR must increment the version in `DynamicsActivitiesPackage/DynamicsActivitiesPackage/DynamicsActivitiesPackage.csproj`:**
- Field: `<Version>X.Y.Z</Version>` — increment for every PR
- Field: `<VersionComment>...</VersionComment>` — update with a short description
- **Patch (Z)** for bug fixes and features, **Minor (Y)** for significant changes

The GitHub Actions workflow `Build, Register and Deploy DMAPP to DMA on PR Merge` runs automatically on PR merge to main, or can be triggered manually via `workflow_dispatch` on any branch. It builds the frontend, packages a `.dmapp`, uploads to the DataMiner Catalog, and deploys to the target agent.

---

## Stack

- React 18 + Vite 5, static build only
- **DataMiner Custom App** — session managed via `DMAConnection` / `DMAUser` cookies
- `@azure/msal-browser` + `@azure/msal-react` for Dynamics 365 and Skyline API tokens
- Dataverse Web API v9.2 for all activity data
- Microsoft Graph API v1.0 for calendar events (attendee prefill)
- Skyline Collaboration API (`api.skyline.be`) for TAM account resolution
- Azure Functions backend for notification subscriptions
- DataMiner design system (CSS custom properties, Inter font, DataMinerIcons)

---

## Authentication (Triple Auth)

The app uses three layers of authentication:

1. **DataMiner session** (primary gate on DMA host): User signs in via `/auth/?url=%2Fpublic%2FDynamicsActivities%2Findex.html`. DataMiner sets `DMAConnection` (connection GUID) and `DMAUser` (JSON user info) cookies. The app reads the cookie, verifies with `IsConnectionAlive`.
2. **MSAL for Dynamics 365 / Graph**: After DMA session is verified, tries `ssoSilent` (same Entra tenant), falls back to popup if consent is needed. Tokens used for Dataverse Web API and Graph calls.
3. **MSAL for Skyline API**: Separate scope `api://53d05a51-7b85-4f10-a44b-69f97640b152/.default`, acquired via `acquireTokenSilent` / popup fallback.

**Dual-mode**: On localhost (`isDataMinerHost()` returns false), the DMA session check is skipped and MSAL popup auth is used directly.

---

## Local Development

**When starting a Copilot session, run the app locally on port 5173.** Kill any existing process on that port first, then start the dev server:

```powershell
# Kill whatever is on port 5173
Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue |
  Select-Object OwningProcess -Unique |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }

# Start the dev server
cd C:\GIT\DynamicsActivities
npx vite --port 5173
```

The Vite dev server includes a proxy for the Skyline API (`/skyline-api` → `https://api.skyline.be`) to bypass CORS restrictions in local dev.

---

## Build Commands

| Command | Purpose | Output | Env file |
|---|---|---|---|
| `npm run dev` | Dev server | — | `.env` |
| `npm run build` | DataMiner production build | `dist-dataminer/` | `.env.dataminer` |
| `npm run build:local` | Local build | `dist/` | `.env` |

The `.csproj` packaging automatically copies `dist-dataminer/` into the `.dmapp` as companion files under `C:\Skyline DataMiner\Webpages\public\DynamicsActivities\`.

---

## Environment Variables

| File | Client ID | Purpose |
|---|---|---|
| `.env` | `acd01a7c-7c83-4977-a98d-ade9e82ae6e8` | Local development |
| `.env.dataminer` | `31b6b722-e159-43bd-a53b-1a450bf5b38c` | DataMiner deployment |

Key variables (see `.env.example` for full list):
```
VITE_DATAVERSE_URL          — Dataverse environment URL
VITE_CLIENT_ID              — Entra app registration client ID
VITE_TENANT_ID              — Entra tenant ID
VITE_REDIRECT_URI           — MSAL redirect URI (must match Entra registration exactly)
VITE_SKYLINE_API_URL        — Skyline API base URL (or /skyline-api for local proxy)
VITE_FUNCTIONS_BASE_URL     — Azure Functions backend URL
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

## Key Source Files

| File | Purpose |
|---|---|
| `src/api/dataminer.js` | DataMiner session management — cookie bootstrap, `IsConnectionAlive`, sign-out, `getDmaUser` |
| `src/api/dataverse.js` | All Dataverse ops — auth, search, create, delete |
| `src/api/graph.js` | Graph calendar fetch for attendee prefill |
| `src/api/skyline.js` | Skyline Collaboration API — TAM customer/project resolution |
| `src/api/subscriptions.js` | Azure Functions backend for notification subscriptions |
| `src/authConfig.js` | MSAL config, scopes for Dataverse/Graph/Skyline |
| `src/components/AuthGuard.jsx` | Triple-auth gate: DMA session → MSAL ssoSilent/popup → WhoAmI |
| `src/components/ActivityForm.jsx` | Activity creation (4 types, account/attendee pickers, calendar) |
| `src/components/NotesList.jsx` | Browse view — lazy server-side OData filters |
| `src/components/SubscriptionsPanel.jsx` | Email notification subscription management |
| `src/components/AutocompletePicker.jsx` | Debounced autocomplete with clearOnPick support |
| `src/components/CalendarPicker.jsx` | Graph calendar modal (60d past + 30d future) |
| `src/hooks/useTamContext.js` | TAM account context — loads managed accounts from Skyline API |
| `src/styles/main.css` | DataMiner design system CSS variables + component styles |
| `vite.config.js` | Build config (dual mode) + Skyline API dev proxy |
| `public/web.config` | IIS SPA rewrite rule for DataMiner/IIS hosting |
| `DynamicsActivitiesPackage/` | .NET project for `.dmapp` packaging |
| `.github/workflows/deploy-dma-on-pr-merge.yml` | CI/CD — build, catalog upload, deploy to DMA |

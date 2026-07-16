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

The GitHub Actions workflow `Build, Register and Deploy DMAPP to DMA on PR Merge` runs automatically on PR merge to main. Manual `workflow_dispatch` supports `dev` deploys on any branch, while `production` deploys are allowed from `main` only. It builds the frontend, packages a `.dmapp`, uploads to the DataMiner Catalog, and deploys to the target agent.

### Branch and PR workflow

- Choose the base branch according to the intended release path: use `main` for work that can go directly to production, and `release-candidate` for work that needs RC validation first.
- If work starts from `origin/release-candidate`, keep the PR based on `release-candidate`; do not rebase it onto `main` just to change the PR target.
- Use the `main` promotion PR for approved work that has already gone through the RC path.
- When creating or updating a PR, make sure the base branch matches both the branch the work started from and the intended deployment path.

---

## Stack

- React 18 + Vite 5, static build only
- **DataMiner Custom App** — session managed via `DMAConnection` / `DMAUser` cookies
- `@azure/msal-browser` + `@azure/msal-react` for Dynamics 365 and Skyline API tokens
- Dataverse Web API v9.2 for all activity data
- Microsoft Graph API v1.0 for calendar events (attendee prefill)
- Skyline Collaboration API (`api.skyline.be`) — proxied via automation script on DMA, direct on localhost
- DataMiner DOM (Object Model) for notification subscriptions (CRUD + scheduled notifications)
- DataMiner Automation Scripts for server-side logic (subscription CRUD, email notifications, API proxy)
- DataMiner design system (CSS custom properties, Inter font, DataMinerIcons)

---

## Notification subscriptions behavior

- `DynamicsActivities_ManageSubscriptions` stores subscription config in DOM.
- `DynamicsActivities_NotifySubscribers` is executed by scheduler task or manual run.
- Script parameters:
  - `Frequency` (`id=10`, string): `instant`, `daily`, `weekly`, `monthly`.
  - `ClientSecret` (`id=11`, string): Dataverse client secret.
- The notify script does **not** enforce an internal cadence gate; every run processes subscriptions matching the passed `Frequency`.
- Activity detection includes both new and updated activities: a record is included if `createdon > since` OR `modifiedon > since` per subscription.
- Sender/from behavior is controlled by DataMiner mail/SMTP configuration.

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
VITE_SKYLINE_API_URL        — Skyline API base URL (proxied on DMA, direct on localhost)
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

When Dataverse schema details are corrected (for example escalation field logical names), update the `dataverse-api` skill in `SkylineCommunications/.github-private` via PR as the source of truth. Do not rely on Copilot memory for schema persistence.

App-specific behavior:
- **Auto-link default** — The UI auto-checks "Link to escalation" when an active escalation is detected for the selected account. Users can uncheck to link directly to the account instead.

---

## Known Dataverse Constraints

- **`$expand` + `$top` on the same query causes HTTP 400 (`0x80060888`)**. Use `Prefer: odata.maxpagesize=100` instead of `$top` when expanding activity parties.
- Activity party skip masks: phonecalls/emails skip 1+9 (sender+owner), appointments skip 7+9 (organizer+owner).
- `noteDate()` falls back: `scheduledstart || scheduledend || actualend || createdon`.
- Browse attendee filtering supports selecting multiple contacts and uses **OR** semantics (`any` matching party per record), not AND. Keep this behavior unless explicitly requested otherwise: activities often have varying attendee sets, and AND produces unexpectedly empty or overly narrow results.

---

## Key Source Files

| File | Purpose |
|---|---|
| `src/api/dataminer.js` | DataMiner session management — cookie bootstrap, `IsConnectionAlive`, sign-out, `getDmaUser` |
| `src/api/dataverse.js` | All Dataverse ops — auth, search, create, delete |
| `src/api/graph.js` | Graph calendar fetch for attendee prefill |
| `src/api/skyline.js` | Skyline Collaboration API — proxied via DMA automation script to avoid CORS |
| `src/api/subscriptions.js` | Subscription CRUD via DataMiner Automation (DOM-backed) |
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
| `DynamicsActivitiesPackage/` | .NET solution for `.dmapp` packaging + automation scripts |
| `DynamicsActivitiesPackage/DynamicsActivitiesPackage/` | Package install script + companion-file deployment wiring |
| `DynamicsActivitiesPackage/DynamicsActivities_ManageSubscriptions/` | CRUD automation script for subscriptions (list/create/update/delete) |
| `DynamicsActivitiesPackage/DynamicsActivities_NotifySubscribers/` | Scheduled email digest sender |
| `DynamicsActivitiesPackage/DynamicsActivities_SkylineApiProxy/` | Server-side proxy for Skyline API (avoids CORS) |
| `.github/workflows/deploy-dma-on-pr-merge.yml` | CI/CD — build, catalog upload, deploy to DMA |

---

## Documentation

**Keep `README.md` up to date whenever you make changes that affect:**
- Features or capabilities of the app
- Project structure (new files, folders, or scripts)
- Build/deploy instructions or prerequisites
- Architecture decisions (e.g. new automation scripts, API changes)
- Environment variable changes

The README is the public-facing documentation for the repository. It should always reflect the current state of the project.

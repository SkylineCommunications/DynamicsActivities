# DynamicsActivities

React + Vite SPA packaged as a **DataMiner Custom App** for working with Dynamics 365 customer activity data.

Today, the mounted app shell is primarily a **browse + subscriptions** experience:

- **Activities** tab for searching Dynamics records across activity, opportunity, lead, and support views
- **Subscriptions** tab for DataMiner-native email digests
- **Access-gate fallback forms** for submitting leads and opportunities when a user does not have Dynamics/Dataverse access

The repository also contains creation/import components (`ActivityForm`, `InboxTab`, `CalendarImportTab`) and related Dataverse helpers, but those flows are **not currently mounted by `src/App.jsx`**.

---

## Current user-facing surface

| Area | What the current app exposes |
|---|---|
| App shell | Header with DataMiner user display, theme toggle (`light` / `dark` / `system`), bug-report button, and sign-out |
| Activities tab | Search and browse Dynamics data with filters, rich previews, direct Dynamics links, and Assistant-generated timeline highlights |
| Browse views | `Activities`, `Opportunities`, `Leads`, and `Support` |
| Subscriptions tab | Create, edit, pause, resume, and delete DataMiner DOM-backed notification subscriptions |
| Access gate | Request-license / request-access screen plus standalone **Add lead** and **Add opportunity** entry points |
| Standalone forms | `#/forms/lead` and `#/forms/opportunity` render outside the Dynamics auth gate |

### Activities tab details

- Multi-account **Regarding** filtering
- Multi-attendee filtering with visible chips and **OR semantics**
- Type filters per view
- Date range filters
- **AI timeline highlights** for the `Activities` view, backed by the `DynamicsActivities_Summarize` automation script
- Rich HTML preview sanitization for imported email/body content
- Direct **Open in Dynamics** links for browsed records
- TAM auto-filtering based on Skyline Collaboration API account ownership

### Record types shown in browse

| View | Backing record types |
|---|---|
| Activities | Phone calls, appointments, emails, escalations, notes |
| Opportunities | Opportunities |
| Leads | Leads |
| Support | Support renewal records |

---

## Architecture

| Layer | Technology / implementation |
|---|---|
| Frontend | React 18 + Vite 5 |
| Hosting | DataMiner Custom App packaged as `.dmapp` |
| Primary auth gate | DataMiner `/auth/` session (`DMAConnection`, `DMAUser`) |
| Microsoft auth | `@azure/msal-browser` + `@azure/msal-react` |
| Business data | Dataverse Web API v9.2 |
| Calendar + inbox | Microsoft Graph v1.0 |
| TAM context | Skyline Collaboration API (`api.skyline.be`) |
| Server-side integration | DataMiner Automation scripts |
| Notifications | DataMiner DOM + `DynamicsActivities_ManageSubscriptions` + `DynamicsActivities_NotifySubscribers` |
| AI summaries | `DynamicsActivities_Summarize`, optionally enhanced by `Skyline.DataMiner.Assistant.Integration.dll` |
| Packaging | `DynamicsActivitiesPackage/` .NET package project copies `dist-dataminer/` into DMAPP companion files |

---

## Authentication and access control

The app uses layered access checks:

1. **DataMiner session** on DMA hosts via `/auth/`
2. **MSAL sign-in** for Graph, Dataverse, and Skyline API scopes
3. **Dynamics license validation** using Graph `licenseDetails`, with fallback to `assignedPlans` only when `licenseDetails` is unavailable
4. **Dataverse access pre-check** before entering the mounted app shell

Rules reflected in the current code:

- Sales / Team Member-capable Dynamics licenses are accepted
- Pure Dataverse/CDS-only SKU families such as `DYN365_CDS_*` are explicitly rejected
- Users without usable access are shown a request-access screen and can still open the standalone **lead** and **opportunity** forms
- On localhost, the DataMiner session check is skipped and popup-based MSAL auth is used directly

### Redirect behavior

- Default DMA base path: `/public/DynamicsActivities/`
- Dev deploy base path: `/public/DynamicsActivitiesDev/`
- Callback path: `<base>/auth-callback`

`src/authConfig.js` derives the callback from `VITE_APP_BASE_PATH` when `VITE_REDIRECT_URI` is not explicitly supplied.

---

## Notification subscriptions

Subscriptions are fully **DataMiner-native** in the current implementation.

- Stored in **DataMiner DOM**
- Managed by `DynamicsActivities_ManageSubscriptions`
- Delivered by `DynamicsActivities_NotifySubscribers`
- Support scopes: **account**, **country**, **region**, **escalation**
- Support frequencies: `instant`, `daily`, `weekly`, `monthly`
- Support activity-type filtering across phone calls, appointments, emails, escalations, and notes

Behavior to be aware of:

- The notify script has **no internal cadence gate**; each run processes subscriptions matching the requested frequency
- New activity detection uses `createdon > LastSentAt`
- Digest emails can include Assistant-generated HTML timeline summaries, with deterministic fallback when Assistant integration is unavailable
- Sender/from behavior is controlled by DataMiner mail / SMTP configuration

---

## Standalone forms

The mounted app shell does not currently expose activity creation, but it does expose two standalone forms through the auth/access flow:

| Route | Purpose | Backend |
|---|---|---|
| `#/forms/lead` | Submit a new lead | `DynamicsActivities_SubmitLead` automation script |
| `#/forms/opportunity` | Submit a new opportunity | `DynamicsActivities_SubmitOpportunity` automation script |

These forms are intentionally reachable outside the normal Dynamics browse experience and depend on the **DataMiner session**, not on Dataverse access.

---

## Environment variables

### Frontend variables used by the current app

| Variable | Required | Purpose |
|---|---|---|
| `VITE_DATAVERSE_URL` | Yes | Dataverse environment base URL |
| `VITE_CLIENT_ID` | Yes | Entra app registration client ID |
| `VITE_TENANT_ID` | Yes | Entra tenant ID |
| `VITE_REDIRECT_URI` | Usually | Explicit MSAL redirect URI |
| `VITE_APP_BASE_PATH` | Optional | Public app base path; defaults to `/public/DynamicsActivities/` on DMA, `/` on localhost |
| `VITE_SKYLINE_API_URL` | Optional | Skyline API base URL; local dev can use `/skyline-api` |
| `VITE_SKYLINE_SCOPE` | Optional | Skyline API scope override |

### Example local setup

```env
VITE_DATAVERSE_URL=https://yourorg.crm4.dynamics.com/
VITE_CLIENT_ID=your-local-app-registration-client-id
VITE_TENANT_ID=your-tenant-id
VITE_REDIRECT_URI=http://localhost:5173/auth-callback
VITE_SKYLINE_API_URL=/skyline-api
```

### Important note about `VITE_FUNCTIONS_BASE_URL`

You will still see `VITE_FUNCTIONS_BASE_URL` in `.env.example`, workflow inputs, and the `Infrastructure/` folder. That value is **not used by the current mounted frontend runtime** in `src/`; the current notification flow is DataMiner-native rather than Azure-Functions-backed.

---

## Local development

### Prerequisites

- Node.js 20+ recommended
- Access to the Skyline Dynamics / Dataverse environment
- An Entra app registration with the required Graph and Dataverse permissions

### Run locally

```bash
npm install
npm run dev
```

The Vite dev server runs on `http://localhost:5173/` and proxies:

```text
/skyline-api -> https://api.skyline.be
```

On localhost:

- DataMiner session bootstrap is skipped
- MSAL uses popup auth flows
- `base` resolves to `./` for local builds and `/` for the dev server

---

## Build, packaging, and deployment

### Frontend build commands

| Command | Purpose | Output |
|---|---|---|
| `npm run dev` | Local dev server | none |
| `npm run build` | DataMiner production build | `dist-dataminer/` |
| `npm run build:local` | Standalone local build | `dist/` |
| `npm run preview` | Preview built site | Vite preview server |

### Packaging

`DynamicsActivitiesPackage/DynamicsActivitiesPackage/DynamicsActivitiesPackage.csproj`:

- packages the app as a **DMAPP**
- copies `dist-dataminer/` into companion files
- installs the web app under:

```text
C:\Skyline DataMiner\Webpages\public\DynamicsActivities\
```

Manual `dev` deploys instead target:

```text
C:\Skyline DataMiner\Webpages\public\DynamicsActivitiesDev\
```
and the frontend build base path is set to `/public/DynamicsActivitiesDev/` so static asset URLs resolve correctly.

### GitHub Actions workflows

| Workflow | Purpose |
|---|---|
| `.github/workflows/build.yml` | Builds the frontend and uploads a zipped `dataminer-dist` artifact |
| `.github/workflows/deploy-dma-on-pr-merge.yml` | Caller workflow for production-on-merge, manual `production` from `main` only, and manual `dev` deploys |
| `.github/workflows/deploy-dmapp-reusable.yml` | Reusable build/register/deploy workflow for DMAPP packaging and Catalog deployment |
| `.github/workflows/copilot-bug-triage.yml` | Auto-comments on `bug`-labeled issues to ask `@copilot` for investigation |
| `.github/workflows/sync-main-to-release-candidate.yml` | Opens or updates the `main` → `release-candidate` promotion PR, enables auto-merge, asks `@copilot` to resolve conflicts, and retries when the PR is updated |

### Release candidate deployment

`release-candidate` is the integration branch for all changes that create, update, or delete Dataverse data. Every push to it deploys the app to:

```text
https://solutionsdma-skyline.on.dataminer.services/auth/?url=%2Fpublic%2FDynamicsActivitiesRC%2Findex.html
```

Open write-capable PRs with `release-candidate` selected as their base branch. When the candidate is approved, open a promotion PR from `release-candidate` into `main`; production remains deployed only when that PR merges.

The release-candidate deployment uses the repository variable `VITE_REDIRECT_URI_RC`, which must match the redirect URI registered on the deployed Entra application:

```text
https://solutionsdma-skyline.on.dataminer.services/public/DynamicsActivitiesRC/
```

### Deployment URLs

**Production**

```text
https://solutionsdma-skyline.on.dataminer.services/auth/?url=%2Fpublic%2FDynamicsActivities%2Findex.html
```

**Manual dev deploy**

```text
https://solutionsdma-skyline.on.dataminer.services/auth/?url=%2Fpublic%2FDynamicsActivitiesDev%2Findex.html
```

### Versioning rule

Every PR must bump both:

- `<Version>`
- `<VersionComment>`

in `DynamicsActivitiesPackage/DynamicsActivitiesPackage/DynamicsActivitiesPackage.csproj`.

---

## DataMiner automation projects in this repo

| Project | Purpose |
|---|---|
| `DynamicsActivities_ManageSubscriptions` | CRUD for DOM-backed subscriptions |
| `DynamicsActivities_NotifySubscribers` | Scheduled / manual digest sender |
| `DynamicsActivities_Summarize` | Timeline-summary generation for browse and digest flows |
| `DynamicsActivities_SkylineApiProxy` | DMA-host proxy to Skyline API to avoid browser CORS issues |
| `DynamicsActivities_SubmitLead` | Emails submitted standalone lead forms |
| `DynamicsActivities_SubmitOpportunity` | Emails submitted standalone opportunity forms |

### Optional Assistant dependency

If `DynamicsActivitiesPackage/Dependencies/Assistant/Skyline.DataMiner.Assistant.Integration.dll` is present, summarize flows can use Assistant Agent Integration. If it is absent, build still succeeds and summary scripts fall back to deterministic mode.

---

## Repository layout

```text
src/
  App.jsx                       # Mounted shell: Activities + Subscriptions tabs
  main.jsx                      # MSAL bootstrap and config guard
  authConfig.js                 # MSAL config, redirect handling, scopes
  api/
    dataminer.js                # DataMiner session bootstrap and JSON API helpers
    dataverse.js                # Dataverse search, browse, create/import helpers
    graph.js                    # Graph license, inbox, and calendar helpers
    skyline.js                  # Skyline API token + proxy/direct fetch helpers
    subscriptions.js            # Subscription CRUD through automation
    activitySummary.js          # Browse/digest summary automation client
    leads.js                    # Standalone lead submission client
    opportunities.js           # Standalone opportunity submission client
  components/
    AuthGuard.jsx               # Access gate and no-access UX
    NotesList.jsx               # Mounted browse experience
    SubscriptionsPanel.jsx      # Mounted subscriptions experience
    SubscriptionForm.jsx        # Create/edit subscription UI
    forms/
      FormPage.jsx              # Standalone form shell
      LeadForm.jsx              # Standalone lead form
      OpportunityForm.jsx       # Standalone opportunity form
    ActivityForm.jsx            # Present in repo but not mounted by App.jsx
    InboxTab.jsx                # Present in repo but not mounted by App.jsx
    CalendarImportTab.jsx       # Present in repo but not mounted by App.jsx
  forms/
    registry.js                 # Standalone form registry
  hooks/
    useHashRoute.js             # Minimal hash router for forms
    useTamContext.js            # TAM account resolution
  services/
    postCreateBrowseAccount.js  # Helper for post-create browse targeting
  styles/
    main.css
public/
  web.config                    # IIS SPA rewrite
DynamicsActivitiesPackage/
  DynamicsActivitiesPackage/    # DMAPP packaging project
  DynamicsActivities_*/         # Automation script projects
Infrastructure/                 # Legacy / alternate Azure Functions IaC docs and Bicep files
```

---

## Known constraints and implementation notes

- Dataverse rejects **`$expand` + `$top`** together on the same query (`0x80060888`); use `Prefer: odata.maxpagesize=...` instead
- Browse attendee filtering intentionally uses **OR semantics**, not AND
- Graph conversation fetch falls back when Graph returns `InefficientFilter`
- HTML previews are sanitized before rendering
- Skyline TAM context and Skyline user lookup degrade gracefully if the Skyline API or consent flow is unavailable
- The current mounted shell does **not** expose the repository's activity creation/import UI, even though supporting code exists in the repo

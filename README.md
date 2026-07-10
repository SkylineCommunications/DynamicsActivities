# DynamicsActivities

A React + Vite SPA deployed as a **DataMiner Custom App** for logging customer interactions as native **Dynamics 365 Activities**.

Replaces a Power App. No custom Dynamics fields — all data lives in standard Dynamics 365 activity entities (plus one custom `slc_escalation` entity).

---

## Features

- Log **Phone Calls**, **Appointments**, **Emails**, and **Escalations** from a lightweight web UI
- Link activities to Dynamics 365 accounts and contacts
- Prefill attendees from your **Microsoft 365 calendar** (meeting rooms filtered out)
- Browse and filter the full organisation's activity history with lazy server-side OData queries
- **TAM account filtering** — auto-selects your managed accounts via the Skyline Collaboration API
- **Notification subscriptions** — subscribe to email digests for account/country/region/escalation scopes and selected activity types
- **License gate** — users without a Dynamics license see a dedicated access page with a one-click prefilled license request email to IT
- Open any activity directly in Dynamics 365 with a single click
- Delete activities with an inline confirm flow
- DataMiner design system — Inter font, DataMinerIcons, CSS custom properties

---

## Stack

| Layer | Technology |
|---|---|
| Framework | React 18 + Vite 5 |
| Hosting | **DataMiner Custom App** (`.dmapp` package deployed via Catalog) |
| Auth | DataMiner session (Entra SSO) + MSAL for Dynamics/Graph/Skyline API tokens |
| Data | Dataverse Web API v9.2 |
| Calendar | Microsoft Graph API v1.0 |
| TAM | Skyline Collaboration API (`api.skyline.be`) |
| Notifications | DataMiner DOM + Automation scripts (`ManageSubscriptions`, `NotifySubscribers`) |
| Styling | CSS custom properties, Inter font (DataMiner design system) |

---

## Authentication

The app uses **triple authentication**:

1. **DataMiner session** — User signs in via DataMiner's `/auth/` page (Entra SSO). Sets `DMAConnection` and `DMAUser` cookies. Verified with `IsConnectionAlive` on app load.
2. **MSAL for Dynamics 365 / Graph** — After DMA session is verified, acquires tokens via `ssoSilent` (same Entra tenant) or popup fallback. Used for Dataverse and Graph API calls.
3. **MSAL for Skyline API** — Separate scope for the Skyline Collaboration API. Token acquired silently or via popup.
4. **Dynamics license validation** — After sign-in, the app verifies the user's Dynamics license (`caltype`). Users without a valid license are redirected to a dedicated "No license" page with a prefilled "Request license for access" mailto action.

On localhost, the DataMiner session check is skipped and MSAL popup auth is used directly.

MSAL uses a **fixed callback path** to avoid redirect drift:

- DataMiner: `https://<dma-host>/public/DynamicsActivities/auth-callback`
- Local dev: `http://localhost:5173/auth-callback`

`VITE_REDIRECT_URI` should point to that callback endpoint (not a deep app route).

---

## Getting Started

### Prerequisites

- Node.js 18+
- Access to the Skyline Dynamics 365 environment
- An Entra app registration with Dataverse and Graph permissions

### Environment Variables

Copy `.env.example` to `.env` and fill in the values:

```env
VITE_DATAVERSE_URL=https://yourorg.crm4.dynamics.com/
VITE_CLIENT_ID=your-local-app-registration-client-id
VITE_TENANT_ID=your-tenant-id
VITE_REDIRECT_URI=http://localhost:5173/auth-callback
```

For the DataMiner production build, `.env.dataminer` is used with the production client ID and redirect URI matching the DMA deployment URL.

### Development

```bash
npm install
npm run dev
```

The dev server includes a proxy for the Skyline API (`/skyline-api` → `https://api.skyline.be`) to bypass CORS restrictions.

### Build

| Command | Output | Env file |
|---|---|---|
| `npm run build` | `dist-dataminer/` | `.env.dataminer` |
| `npm run build:local` | `dist/` | `.env` |

**Always use `npm run build` for DataMiner deployment.**

---

## Deployment

Deployment is automated via the **"Build, Register and Deploy DMAPP"** GitHub Actions workflow:

1. Triggers on PR merge to `main` or via manual `workflow_dispatch`
2. Builds the frontend (`npm run build`)
3. Packages into a `.dmapp` using the `DynamicsActivitiesPackage/` .NET project
4. Uploads to the DataMiner Catalog
5. Deploys to the target DMA agent

The build output (`dist-dataminer/`) is packaged as companion files and installed to:
```
C:\Skyline DataMiner\Webpages\public\DynamicsActivities\
```

**Access URL:**
```
https://solutionsdma-skyline.on.dataminer.services/auth/?url=%2Fpublic%2FDynamicsActivities%2Findex.html
```

### Versioning

Every PR must bump `<Version>` in `DynamicsActivitiesPackage/DynamicsActivitiesPackage/DynamicsActivitiesPackage.csproj` to avoid Catalog conflicts.

---

## Notification Subscriptions (DataMiner-native)

- Subscriptions are stored in **DataMiner DOM** and managed via `DynamicsActivities_ManageSubscriptions`.
- Digests are sent by `DynamicsActivities_NotifySubscribers` (run by scheduler task or manually).
- Notify script parameters:
  - `Frequency` (string): `instant`, `daily`, `weekly`, `monthly` — used to select which subscriptions to process.
  - `ClientSecret` (string): Dataverse app secret used for token acquisition.
- There is **no internal cadence gate** in the notify script anymore: each run processes eligible subscriptions immediately.
- New items are still detected using `createdon > LastSentAt` per subscription.
- Sender address is controlled by DataMiner/SMTP configuration.

---

## Known Dataverse Constraints

- **`$expand` + `$top` on the same query → HTTP 400 (`0x80060888`)** — use `Prefer: odata.maxpagesize=N` instead of `$top` when expanding activity parties
- On localhost, auth uses popup flows — `ssoSilent` only works when a DataMiner Entra session already exists

---

## Project Structure

```
src/
  api/
    dataminer.js       # DataMiner session bootstrap, cookies, sign-out
    dataverse.js       # All Dataverse ops (auth, search, create)
    graph.js           # Graph calendar fetch for attendee prefill
    skyline.js         # Skyline Collaboration API (TAM accounts)
    subscriptions.js   # Subscription CRUD via DataMiner Automation scripts (DOM-backed)
  components/
    AuthGuard.jsx      # Triple-auth gate (DMA → MSAL → WhoAmI)
    ActivityForm.jsx   # Activity creation (4 types, pickers, calendar)
    NotesList.jsx      # Browse view with lazy server-side OData filters
    SubscriptionsPanel.jsx  # Notification subscription management
    AutocompletePicker.jsx
    CalendarPicker.jsx
    CalendarImportTab.jsx
    InboxTab.jsx
  hooks/
    useTamContext.js   # TAM account context from Skyline API
  services/
    postCreateBrowseAccount.js # Centralized account resolution after create/import flows
  authConfig.js        # MSAL config, scopes
  styles/
    main.css           # DataMiner design system CSS
public/
  web.config           # IIS SPA rewrite rule
DynamicsActivitiesPackage/  # .NET project for .dmapp packaging
.github/workflows/     # CI/CD workflows
```

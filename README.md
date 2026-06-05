# DynamicsActivities

A React + Vite SPA for quickly logging customer interactions as native **Dynamics 365 Activities**, deployed on Skyline DataMiner.

Replaces a Power App. No custom Dynamics fields — all data lives in standard Dynamics 365 activity entities.

---

## Features

- Log **Phone Calls**, **Appointments**, and **Emails** directly from a lightweight web UI
- Link activities to Dynamics 365 accounts and contacts
- Prefill attendees from your **Microsoft 365 calendar** (meeting rooms filtered out)
- Browse and filter the full organisation's activity history with lazy server-side OData queries
- Open any activity directly in Dynamics 365 with a single click
- Delete activities with an inline confirm flow
- Skyline dark design system — feels at home inside DataMiner

---

## Stack

| Layer | Technology |
|---|---|
| Framework | React 18 + Vite 5 |
| Auth | `@azure/msal-browser` / `@azure/msal-react` (popup-only, iframe-safe) |
| Data | Dataverse Web API v9.2 |
| Calendar | Microsoft Graph API v1.0 |
| Styling | CSS custom properties, Inter font (Skyline design language) |
| Hosting | Static build on DataMiner / IIS |

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
VITE_REDIRECT_URI=http://localhost:5173
```

For the DataMiner production build, create `.env.dataminer` with the production client ID and redirect URI pointing to the DataMiner deployment URL.

### Development

```bash
npm install
npm run dev
```

### Build

| Command | Output | Uses env |
|---|---|---|
| `npm run build` | `dist-dataminer/` | `.env.dataminer` |
| `npm run build:local` | `dist/` | `.env` |

**Always use `npm run build` before deploying to DataMiner.**

---

## Deployment

Deploy the contents of `dist-dataminer/` to the DataMiner server under:

```
C:\Skyline DataMiner\Webpages\public\DynamicsActivities\
```

The included `public/web.config` configures IIS URL rewriting for SPA routing.

Live URL: `https://solutionsdma-skyline.on.dataminer.services/public/DynamicsActivities/`

---

## Known Dataverse Constraints

- **`$expand` + `$top` on the same query → HTTP 400 (`0x80060888`)** — use `Prefer: odata.maxpagesize=N` instead of `$top` when expanding activity parties
- Auth uses popup flows only — `loginRedirect` breaks inside the DataMiner iframe

---

## Project Structure

```
src/
  api/
    dataverse.js     # All Dataverse ops (auth, search, create, delete)
    graph.js         # Graph calendar fetch for attendee prefill
  components/
    AuthGuard.jsx    # Popup login, WhoAmI, render-prop auth gate
    ActivityForm.jsx # Activity creation form (3 types, pickers, calendar fill)
    NotesList.jsx    # Browse view with lazy server-side OData filters
    AutocompletePicker.jsx
    CalendarPicker.jsx
  styles/
    main.css         # Skyline design system CSS variables + components
public/
  web.config         # IIS SPA rewrite rule
```

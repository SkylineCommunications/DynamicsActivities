# DynamicsActivities — Notification Functions

Azure Functions backend for the DynamicsActivities notification and subscription system.

---

## Local Testing Dependencies

### 1. Node.js 20 (exact — v18 or v20 only)

Azure Functions Core Tools v4 is **incompatible with Node 24+**. You must use Node 18 or 20.

Use [fnm](https://github.com/Schniz/fnm) to manage versions on Windows:

```powershell
winget install Schniz.fnm

# Add to your PowerShell profile ($PROFILE):
fnm env --use-on-cd | Out-String | Invoke-Expression

# Then reload and install Node 20:
. $PROFILE
fnm install 20
fnm use 20
node --version   # must show v20.x
```

### 2. Azure Functions Core Tools v4

```powershell
npm install -g azure-functions-core-tools@4 --unsafe-perm true
func --version   # must show 4.x
```

### 3. Azurite (local Azure Storage emulator)

Required for timer triggers (digest functions) and Azure Table Storage (subscriptions, read receipts, etc.).

```powershell
npm install -g azurite

# Start before running func start:
azurite --silent --location C:\azurite
```

Or use the [VS Code Azurite extension](https://marketplace.visualstudio.com/items?itemName=Azurite.azurite) and click **Start Azurite** in the status bar.

### 4. `local.settings.json`

```powershell
cd functions
copy local.settings.json.example local.settings.json
```

Fill in all `<placeholder>` values — see the [Environment Variables](#environment-variables) table below.
`AzureWebJobsStorage` and `AZURE_STORAGE_CONNECTION_STRING` should stay as `UseDevelopmentStorage=true` (Azurite handles these).

> ⚠️ **Never commit `local.settings.json`** — it contains secrets and is already in `.gitignore`.

---

## Local Setup (full sequence)

```powershell
# 1. Switch to Node 20
fnm use 20

# 2. Start Azurite in a separate terminal
azurite --silent --location C:\azurite

# 3. Install dependencies and start functions
cd functions
npm install
func start
```

Expected output — all HTTP endpoints listed + timer triggers registered:
```
Functions:
    subscriptionsGet:    [GET]    http://localhost:7071/api/subscriptions
    subscriptionsPost:   [POST]   http://localhost:7071/api/subscriptions
    subscriptionsPut:    [PUT]    http://localhost:7071/api/subscriptions/{id}
    subscriptionsDelete: [DELETE] http://localhost:7071/api/subscriptions/{id}
    notifyWebhook:       [POST]   http://localhost:7071/api/notify
    testEmail:           [POST]   http://localhost:7071/api/test-email
    actionsMarkRead:     [GET,POST] http://localhost:7071/api/actions/mark-read
    actionsReadStatus:   [GET]    http://localhost:7071/api/actions/read-status
    digestDaily:         timerTrigger
    digestWeekly:        timerTrigger
    digestMonthly:       timerTrigger
```

The frontend dev server (`npm run dev` from the repo root) connects to the Functions backend via `VITE_FUNCTIONS_BASE_URL` in your `.env`. There are three modes:

| Mode | `VITE_FUNCTIONS_BASE_URL` in `.env` | Functions target |
|---|---|---|
| **Fully local** | `http://localhost:7071/api` | `func start` + Azurite |
| **Local SPA → dev Azure** | `https://dmact-func-dev-7gqnlq.azurewebsites.net/api` | Deployed dev app |
| **DataMiner prod** | *(set in `.env.dataminer`)* | Deployed prod app |

---


## Environment Variables

| Variable | Description |
|---|---|
| `DATAVERSE_URL` | Dataverse org URL, e.g. `https://skyline365-qa.crm4.dynamics.com` |
| `DATAVERSE_CLIENT_ID` | App registration client ID (needs Dataverse + Dynamics permissions) |
| `DATAVERSE_CLIENT_SECRET` | App registration client secret |
| `DATAVERSE_TENANT_ID` | Azure AD tenant ID |
| `AZURE_STORAGE_CONNECTION_STRING` | Azure Storage connection string |
| `SENDGRID_API_KEY` | SendGrid API key |
| `SENDGRID_FROM_EMAIL` | Verified sender email address |
| `SENDGRID_FROM_NAME` | Sender display name (default: "Skyline Activities") |
| `SENDGRID_TEST_EMAIL` | If set, all emails are redirected here (for safe testing) |
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI endpoint URL |
| `AZURE_OPENAI_KEY` | Azure OpenAI API key |
| `AZURE_OPENAI_DEPLOYMENT` | Deployment name, e.g. `gpt-4o` |
| `WEBHOOK_SECRET` | Secret for validating Dataverse webhook calls (min 32 chars) |
| `ACTION_TOKEN_SECRET` | HMAC secret for signing email action links (min 32 chars) |
| `INSTANT_COOLDOWN_MINUTES` | Cooldown window for instant notifications (default: 15) |
| `SPA_BASE_URL` | Public URL of the DynamicsActivities SPA |
| `FUNCTIONS_BASE_URL` | Public URL of the Functions API (used in email action links) |
| `ENTRA_TENANT_ID` | Azure AD tenant ID (for validating user tokens from the SPA) |
| `ENTRA_AUDIENCE` | Dataverse org URL — must match the `aud` claim of the token the SPA sends (e.g. `https://skyline365-qa.crm4.dynamics.com`) |

---

## App Registration Requirements

Create (or reuse) an app registration in Azure AD for the Functions backend:

1. Grant **Dynamics CRM** API permission: `user_impersonation` (application permission)
2. Create a client secret and set `DATAVERSE_CLIENT_ID` / `DATAVERSE_CLIENT_SECRET`
3. In Dataverse, assign the app registration a security role (e.g. "System Administrator" or a custom role with read/write on activities)

---

## Dataverse Webhook Registration

After deploying the Functions app, register webhooks to enable instant notifications:

### Via Plugin Registration Tool (recommended)

1. Download the [Plugin Registration Tool](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/download-tools-nuget)
2. Connect to your Dynamics 365 org
3. Go to **Register > Register New Web Hook**
4. Configure:
   - **Name**: `DynamicsActivities_Notify`
   - **Endpoint URL**: `https://<your-function-app>.azurewebsites.net/api/notify`
   - **Authentication**: Header
   - **Header name**: `x-webhook-secret`
   - **Header value**: value of `WEBHOOK_SECRET`
5. Add steps for **Create** message on each entity:
   - `phonecall`
   - `appointment`
   - `email`
   - `slc_escalation`
   - Set **Execution Mode**: Asynchronous

### Via Dataverse API

```http
POST [org]/api/data/v9.2/serviceendpoints
{
  "name": "DynamicsActivities_Notify",
  "contract": 8,
  "url": "https://<function-app>.azurewebsites.net/api/notify",
  "authtype": 5,
  "messageformat": 2
}
```

---

## Azure Tables

Tables are auto-created on first run via `ensureTables()`:

| Table | Purpose |
|---|---|
| `Subscriptions` | User notification subscriptions |
| `PendingInstant` | Buffered activities during instant cooldown window |
| `NotificationLog` | Audit log of sent notifications |
| `ReadReceipts` | Per-user activity read status |
| `FollowUps` | User-initiated follow-up actions from digest emails |

---

## Deployed Function Apps

Both apps live in subscription `327a6575-94e4-4d02-bb5d-9a88d68f58b9`, resource group `rg-dynamics-activities` (westeurope):

| App | Name | Dataverse | Use for |
|---|---|---|---|
| **Dev** | `dmact-func-dev-7gqnlq` | `skyline365-qa.crm4.dynamics.com` | Local SPA development, testing |
| **Prod** | `dmact-func-prod-7gqnlq` | `skyline365.crm4.dynamics.com` | DataMiner production deployment |

Storage accounts: `dmactstordev7gqnlq` (dev) · `dmactstorprod7gqnlq` (prod)

Secrets are stored in Key Vault (both in subscription `327a6575-...`):
- Dev: `kv-dynamics-748`
- Prod: `kv-dynamics-114`

---

## Deployment

### Via GitHub Actions (recommended)

The `.github/workflows/deploy-functions.yml` workflow deploys automatically:
- **On push to `main`** when files under `functions/` change → deploys to **prod**
- **Manual dispatch** → choose `dev` or `prod`

#### GitHub Actions setup status

| What | Status | Notes |
|---|---|---|
| Environment `prod` | ✅ created | — |
| Environment `dev` | ✅ created | — |
| `FUNC_APP_NAME` var (prod) | ✅ set | `dmact-func-prod-7gqnlq` |
| `FUNC_APP_NAME` var (dev) | ✅ set | `dmact-func-dev-7gqnlq` |
| `VITE_FUNCTIONS_BASE_URL` repo var | ✅ set | `https://dmact-func-prod-7gqnlq.azurewebsites.net/api` |
| `AZURE_CREDENTIALS` secret (prod) | ❌ **TODO** | See below |
| `AZURE_CREDENTIALS` secret (dev) | ❌ **TODO** | See below |

#### ⚠️ TODO: Add AZURE_CREDENTIALS to both environments

Create a service principal and add its JSON as `AZURE_CREDENTIALS` in **both** GitHub environments (Settings → Environments → `prod` / `dev` → Secrets):

```powershell
az account set --subscription 327a6575-94e4-4d02-bb5d-9a88d68f58b9

az ad sp create-for-rbac `
  --name "github-dmact-deploy" `
  --role contributor `
  --scopes /subscriptions/327a6575-94e4-4d02-bb5d-9a88d68f58b9/resourceGroups/rg-dynamics-activities `
  --sdk-auth
```

Copy the full JSON output and add it as secret `AZURE_CREDENTIALS` on both the `prod` and `dev` environments at:
[https://github.com/SkylineCommunications/DynamicsActivities/settings/environments](https://github.com/SkylineCommunications/DynamicsActivities/settings/environments)

### Via Azure CLI

```powershell
az account set --subscription 327a6575-94e4-4d02-bb5d-9a88d68f58b9
cd functions
npm ci
func azure functionapp publish dmact-func-dev-7gqnlq --javascript   # dev
func azure functionapp publish dmact-func-prod-7gqnlq --javascript  # prod
```

---

## Architecture Notes

- **Instant subscriptions** are handled exclusively by the Dataverse webhook (`POST /api/notify`). Digest subscribers never receive emails from the webhook.
- **Digest subscriptions** (daily/weekly/monthly) are handled exclusively by the three timer functions.
- **Spam protection**: instant notifications have a configurable cooldown window (`INSTANT_COOLDOWN_MINUTES`). Activities arriving during the cooldown are buffered in `PendingInstant` and flushed together in the next email.
- **Empty digests are never sent** — the digest timers skip users with no new activities in the window.

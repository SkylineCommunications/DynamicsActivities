# DynamicsActivities — Notification Functions

Azure Functions backend for the DynamicsActivities notification and subscription system.

## Prerequisites

- Node.js 20+
- [Azure Functions Core Tools v4](https://learn.microsoft.com/en-us/azure/azure-functions/functions-run-local)
- [Azurite](https://learn.microsoft.com/en-us/azure/storage/common/storage-use-azurite) (local Azure Storage emulator)
- An Azure subscription with:
  - Azure Function App (Node 20, Consumption or Premium)
  - Azure Storage Account
  - SendGrid API key
  - Azure OpenAI resource with a GPT-4o deployment

---

## Local Setup

```bash
cd functions
cp local.settings.json.example local.settings.json
# Fill in all placeholder values in local.settings.json

npm install
func start
```

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
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI endpoint URL |
| `AZURE_OPENAI_KEY` | Azure OpenAI API key |
| `AZURE_OPENAI_DEPLOYMENT` | Deployment name, e.g. `gpt-4o` |
| `WEBHOOK_SECRET` | Secret for validating Dataverse webhook calls (min 32 chars) |
| `ACTION_TOKEN_SECRET` | HMAC secret for signing email action links (min 32 chars) |
| `INSTANT_COOLDOWN_MINUTES` | Cooldown window for instant notifications (default: 15) |
| `SPA_BASE_URL` | Public URL of the DynamicsActivities SPA |
| `ENTRA_TENANT_ID` | Azure AD tenant ID (for validating user tokens from the SPA) |
| `ENTRA_AUDIENCE` | Azure AD app registration client ID for the SPA |

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

## Deployment

```bash
# Deploy to Azure (requires Azure CLI logged in)
func azure functionapp publish <your-function-app-name> --javascript

# Or use GitHub Actions (add AZURE_FUNCTIONAPP_PUBLISH_PROFILE secret)
```

Set all environment variables in the Function App's **Configuration > Application settings**.

---

## Architecture Notes

- **Instant subscriptions** are handled exclusively by the Dataverse webhook (`POST /api/notify`). Digest subscribers never receive emails from the webhook.
- **Digest subscriptions** (daily/weekly/monthly) are handled exclusively by the three timer functions.
- **Spam protection**: instant notifications have a configurable cooldown window (`INSTANT_COOLDOWN_MINUTES`). Activities arriving during the cooldown are buffered in `PendingInstant` and flushed together in the next email.
- **Empty digests are never sent** — the digest timers skip users with no new activities in the window.

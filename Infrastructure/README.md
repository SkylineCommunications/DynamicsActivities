# DynamicsActivities Infrastructure

Bicep templates for deploying the notification system backend (Azure Functions).

## Structure

```
Infrastructure/
├── main.bicep              # Main orchestration template
├── modules/
│   ├── storage.bicep       # Azure Storage Account (Table Storage)
│   ├── app-insights.bicep  # Application Insights
│   ├── app-service-plan.bicep # Consumption App Service Plan
│   └── function-app.bicep  # Azure Function App with runtime config
├── parameters.dev.json     # Development parameters
└── parameters.prod.json    # Production parameters
```

## Resources Deployed

| Resource | Purpose |
|---|---|
| **Storage Account** (StorageV2) | Table Storage for subscriptions, notifications, pending items |
| **App Service Plan** | Consumption tier (Y1) for serverless functions |
| **Function App** | Node.js 20 runtime, 6 HTTP/timer triggers |
| **Application Insights** | Monitoring, diagnostics, logging |

## Functions Included

### HTTP Endpoints
- `GET /api/subscriptions` — List user subscriptions (requires auth)
- `POST /api/subscriptions` — Create subscription
- `PUT /api/subscriptions/{id}` — Update subscription
- `DELETE /api/subscriptions/{id}` — Delete subscription
- `POST /api/notify` — Dataverse webhook receiver (instant notifications)
- `POST /api/actions/mark-read` — Mark activity as read
- `GET /api/actions/read-status` — Get read status for activities

### Timer Triggers
- **digestDaily** — 6:00 UTC daily (sends daily digest emails)
- **digestWeekly** — Monday 7:00 UTC (sends weekly digest emails)
- **digestMonthly** — 1st of month 8:00 UTC (sends monthly digest emails)

## Prerequisites

1. **Azure subscription** (provided: 327a6575-94e4-4d02-bb5d-9a88d68f58b9)
2. **Resource Group** with appropriate permissions
3. **Secrets stored in Key Vault**:
   - `dataverse-client-secret`
   - `sendgrid-api-key`
   - `openai-api-key`

## Deployment

### Step 1: Update Parameters

Edit `parameters.dev.json` or `parameters.prod.json` with:
- Resource Group name
- Key Vault resource ID
- Dataverse Client ID
- Function App Client ID
- Location (default: eastus)

### Step 2: Deploy via Azure CLI

```bash
# Dev environment
az deployment group create \
  --resource-group YOUR_RG_NAME \
  --template-file Infrastructure/main.bicep \
  --parameters Infrastructure/parameters.dev.json

# Prod environment
az deployment group create \
  --resource-group YOUR_RG_NAME \
  --template-file Infrastructure/main.bicep \
  --parameters Infrastructure/parameters.prod.json
```

### Step 3: Deploy Function Code

```bash
# From the functions/ directory
cd functions
func azure functionapp publish <FUNCTION_APP_NAME> --build remote --build-native-deps
```

## Configuration Reference

### Environment Variables (set by Bicep)

| Variable | Purpose |
|---|---|
| `DATAVERSE_URL` | Dataverse org URL |
| `DATAVERSE_CLIENT_ID` | OAuth client ID |
| `DATAVERSE_CLIENT_SECRET` | OAuth client secret (from Key Vault) |
| `SENDGRID_API_KEY` | SendGrid API key (from Key Vault) |
| `OPENAI_API_KEY` | OpenAI API key (from Key Vault) |
| `ENTRA_ID_TENANT_ID` | Azure AD tenant ID |
| `FUNCTION_CLIENT_ID` | Function App's client ID for auth |
| `INSTANT_COOLDOWN_MINUTES` | Delay before sending instant notifications (default: 15) |

### CORS

Frontend origins are configured via the `corsOrigins` parameter:
- **Dev**: `http://localhost:5173,http://localhost:4173`
- **Prod**: `https://solutionsdma-skyline.on.dataminer.services/public/DynamicsActivities/`

## Monitoring

### Application Insights

All requests, errors, and custom events are logged to Application Insights.

**View logs:**
```bash
az monitor app-insights query \
  --app <APP_INSIGHTS_NAME> \
  --analytics-query 'requests | where client_Type == "Browser" | take 20'
```

### Function Logs

```bash
func azure functionapp logstream <FUNCTION_APP_NAME>
```

## Scaling

- **Storage**: Geo-redundant (GRS) in production, locally redundant (LRS) in dev
- **Compute**: Auto-scales with demand (Consumption tier)
- **Application Insights**: 90-day retention in production, 30 days in dev

## Cost Estimation

Approximate monthly costs (per environment):

| Resource | Dev | Prod |
|---|---|---|
| Function App (1M executions) | ~$0.30 | ~$0.30 |
| Storage (100 GB) | ~$2 | ~$4 (GRS) |
| Application Insights | ~$1 | ~$5 |
| **Total** | **~$3** | **~$10** |

(Actual costs depend on usage; Consumption tier is highly cost-effective.)

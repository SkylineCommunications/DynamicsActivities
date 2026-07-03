# DynamicsActivities Notification Functions — Quick Start

## 📋 What's Deployed

Your Bicep templates create **complete infrastructure** for the notification system:

| Component | Purpose |
|---|---|
| **Function App** | Node.js 20 runtime with 6 HTTP + 3 timer triggers |
| **Storage Account** | Table Storage for subscriptions, notifications, pending items |
| **App Service Plan** | Serverless Consumption tier (auto-scaling) |
| **Application Insights** | Monitoring, error tracking, performance insights |

## 🚀 Quick Deploy

### Prerequisites
- **Azure CLI** (`az`)
- **Azure subscription**: `327a6575-94e4-4d02-bb5d-9a88d68f58b9`
- **Secrets in Key Vault**:
  - `dataverse-client-secret`
  - `sendgrid-api-key`
  - `openai-api-key`

### Deploy (Windows)
```batch
set RESOURCE_GROUP=my-dynamics-rg
set ENVIRONMENT=dev
Infrastructure\deploy.bat
```

### Deploy (macOS/Linux)
```bash
export RESOURCE_GROUP=my-dynamics-rg
export ENVIRONMENT=dev
bash Infrastructure/deploy.sh
```

## 📝 Pre-Deployment Checklist

1. **Edit parameters file** (`Infrastructure/parameters.{dev|prod}.json`):
   - [ ] Set correct Key Vault resource ID
   - [ ] Set correct Resource Group name
   - [ ] Set Dataverse Client ID
   - [ ] Set Function App Client ID
   - [ ] Verify location (default: eastus)

2. **Create/verify Key Vault secrets**:
   ```bash
   az keyvault secret set --vault-name YOUR_KV --name dataverse-client-secret --value "YOUR_SECRET"
   az keyvault secret set --vault-name YOUR_KV --name sendgrid-api-key --value "YOUR_KEY"
   az keyvault secret set --vault-name YOUR_KV --name openai-api-key --value "YOUR_KEY"
   ```

3. **Verify Azure AD app registrations**:
   - [ ] Dataverse OAuth client registered
   - [ ] Function App client ID created
   - [ ] Proper API permissions granted

## 🔧 After Deployment

### 1. Deploy Function Code
```bash
cd functions
func azure functionapp publish <FUNCTION_APP_NAME> --build remote --build-native-deps
```

### 2. Configure Dataverse Webhook
In **Dataverse > Settings > Plug-in Assemblies**:

Register webhook for `POST /api/notify` triggered by:
- `create` event on `phonecalls`, `appointments`, `emails`, `slc_escalations`
- Include `target` entity in webhook payload

**Webhook URL**: `https://<FUNCTION_APP_NAME>.azurewebsites.net/api/notify`

### 3. Update Frontend Environment Variables

`.env.dataminer`:
```env
VITE_FUNCTIONS_BASE_URL=https://<FUNCTION_APP_NAME>.azurewebsites.net/api
```

## 📊 Verify Deployment

### Check Function App is running:
```bash
az functionapp show --resource-group YOUR_RG --name YOUR_FUNCTION_APP_NAME
```

### Stream live logs:
```bash
func azure functionapp logstream <FUNCTION_APP_NAME>
```

### Test subscription endpoint:
```bash
curl -X GET \
  https://<FUNCTION_APP_NAME>.azurewebsites.net/api/subscriptions \
  -H "Authorization: Bearer <YOUR_TOKEN>"
```

### View Application Insights:
```bash
az monitor app-insights metrics show \
  --resource-group YOUR_RG \
  --app <FUNCTION_APP_NAME>-ai-dev
```

## 🐛 Troubleshooting

### "Invalid JSON" error in frontend
→ Check `VITE_FUNCTIONS_BASE_URL` in `.env.dataminer`
→ Verify Function App is deployed and running

### Auth failures (401)
→ Check Entra ID tenant ID and client ID
→ Verify Function App has correct client ID configured
→ Check token validation in `/functions/src/shared/auth.js`

### Storage table not found
→ Storage tables are auto-created by Bicep during deployment
→ If missing, verify Storage Account is in Resource Group
→ Check `Azure Portal > Storage > Tables`

### Timer functions not running
→ Verify `FUNCTIONS_EXTENSION_VERSION=~4` in App Settings
→ Check `FUNCTIONS_WORKER_RUNTIME=node`
→ View `Application Insights > Traces` for timer execution logs

## 📚 Key Files

- **Infrastructure orchestration**: `main.bicep`
- **Resource modules**: `modules/*.bicep`
- **Parameter templates**: `parameters.{dev|prod}.json`
- **Deployment scripts**: `deploy.{sh|bat}`
- **Function source**: `../functions/src/`

## 💰 Estimated Monthly Cost

| Environment | Storage | Compute | Insights | Total |
|---|---|---|---|---|
| Dev | $2 | $0.30 | $1 | **~$3** |
| Prod | $4 (GRS) | $0.30 | $5 | **~$9** |

Consumption tier scales to zero when idle (no cost).

## 🔗 Related Documentation

- [Azure Functions Bicep reference](https://learn.microsoft.com/en-us/azure/templates/microsoft.web/sites)
- [Function App settings](../functions/README.md)
- [Frontend setup](../README.md)

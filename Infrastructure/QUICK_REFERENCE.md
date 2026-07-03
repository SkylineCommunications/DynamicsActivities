# Quick Reference Card - Infrastructure Deployment

## 📋 Your Deployment Configuration

### Subscription
```
Name: sub-bpa-test
ID: a476a434-0f2f-45db-bf17-cf278ef08379
Tenant: 5f175691-8d1c-4932-b7c8-ce990839ac40
Region: eastus
```

### Key Vault (Pre-Configured)
```
Name: kv-dynamics-748
Resource Group: rg-dynamics-activities
Location: eastus
Status: ✅ Created & Configured
Secrets: 
  - dataverse-client-secret
  - sendgrid-api-key
  - openai-api-key
```

### Deployment Parameters (dev)
```
Dataverse URL: https://skyline365-qa.crm4.dynamics.com/
Dataverse Client ID: acd01a7c-7c83-4977-a98d-ade9e82ae6e8
Tenant ID: 5f175691-8d1c-4932-b7c8-ce990839ac40
Function Prefix: dmact
CORS: http://localhost:5173,http://localhost:4173
Instant Cooldown: 15 minutes
```

## 🚀 Deploy in 3 Commands

```batch
:: 1. Navigate to project
cd C:\GitHub\DynamicsActivities

:: 2. Deploy infrastructure
set RESOURCE_GROUP=rg-dynamics-activities
set ENVIRONMENT=dev
Infrastructure\deploy.bat

:: 3. Deploy function code (after infrastructure deployment completes)
cd functions
func azure functionapp publish <APP_NAME> --build remote --build-native-deps
```

## 📁 Key Files

| File | Purpose |
|---|---|
| `Infrastructure/main.bicep` | Main orchestration |
| `Infrastructure/parameters.dev.json` | **CONFIGURED** - Ready to use |
| `Infrastructure/deploy.bat` | Windows deployment script |
| `Infrastructure/README.md` | Complete documentation |
| `Infrastructure/QUICKSTART.md` | Fast reference |

## ✅ Pre-Deployment Checklist

- [x] Azure CLI installed
- [x] Authenticated to Azure
- [x] Resource Group created: `rg-dynamics-activities`
- [x] Key Vault created: `kv-dynamics-748`
- [x] Secrets created (3 total)
- [x] Parameters configured: `parameters.dev.json`
- [x] Bicep templates validated
- [x] RBAC permissions granted

## 🔧 Resources Being Deployed

```
Function App (Node.js 20)
  ├─ HTTP Triggers (5 endpoints)
  │  ├─ GET /api/subscriptions
  │  ├─ POST /api/subscriptions
  │  ├─ PUT /api/subscriptions/{id}
  │  ├─ DELETE /api/subscriptions/{id}
  │  └─ POST /api/notify
  ├─ Timer Triggers (3)
  │  ├─ digestDaily (6:00 UTC)
  │  ├─ digestWeekly (Mon 7:00 UTC)
  │  └─ digestMonthly (1st 8:00 UTC)
  └─ Storage: 4 tables + App Insights

Storage Account (StorageV2)
  └─ Tables: Subscriptions, Notifications, PendingInstant, ReadStatus

App Service Plan (Consumption Y1)
  └─ Auto-scaling: 0 → unlimited

Application Insights
  └─ Monitoring: Logs, errors, performance
```

## 💰 Cost: ~$3/month (dev)

- Function App: Free (first 1M calls)
- Storage: ~$2
- Application Insights: ~$1

## 📋 Post-Deployment Steps

1. **Get Function App name**
   ```
   az functionapp list -g rg-dynamics-activities --query "[].name" -o tsv
   ```

2. **Configure Dataverse webhook**
   - URL: `https://<APP_NAME>.azurewebsites.net/api/notify`
   - Method: POST
   - Events: create on phonecalls, appointments, emails, slc_escalations

3. **Update frontend** (`.env.dataminer`)
   ```env
   VITE_FUNCTIONS_BASE_URL=https://<APP_NAME>.azurewebsites.net/api
   ```

4. **Monitor deployment**
   ```
   func azure functionapp logstream <APP_NAME>
   ```

## 🆘 Help & Documentation

- **Complete Setup**: `Infrastructure/README.md`
- **Quick Start**: `Infrastructure/QUICKSTART.md`
- **Pre-Flight**: `Infrastructure/DEPLOYMENT_READY.md`
- **Status**: `Infrastructure/COMPLETION_REPORT.md`

## ✨ Status

**READY FOR DEPLOYMENT** ✅

All prerequisites met. All files configured. All templates validated.

Execute: `Infrastructure\deploy.bat`

---

**Created**: 2026-06-26  
**Config Version**: dev (parameters.dev.json)  
**Location**: `C:\GitHub\DynamicsActivities\Infrastructure\`

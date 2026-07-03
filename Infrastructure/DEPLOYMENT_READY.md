# Infrastructure Deployment - Ready to Deploy ✅

## 🎯 Deployment Summary

**Status**: ✅ **READY FOR DEPLOYMENT**

### Subscription Information
- **Subscription**: `sub-bpa-test`
- **Subscription ID**: `327a6575-94e4-4d02-bb5d-9a88d68f58b9`
- **Tenant ID**: `5f175691-8d1c-4932-b7c8-ce990839ac40`
- **Location**: `eastus`

### Resource Group
- **Name**: `rg-dynamics-activities`
- **Status**: ✅ Created

### Key Vault (for Secrets)
- **Name**: `kv-dynamics-748`
- **Status**: ✅ Created
- **Resource ID**: `/subscriptions/327a6575-94e4-4d02-bb5d-9a88d68f58b9/resourceGroups/rg-dynamics-activities/providers/Microsoft.KeyVault/vaults/kv-dynamics-748`
- **Secrets Configured**:
  - ✅ `dataverse-client-secret`
  - ✅ `sendgrid-api-key`
  - ✅ `openai-api-key`
- **Features Enabled**:
  - ✅ Template Deployment Access
  - ✅ RBAC Authorization

### Bicep Templates
- **Main Template**: ✅ `main.bicep` (3.8 KB)
- **Modules**:
  - ✅ `storage.bicep` (1.8 KB)
  - ✅ `app-insights.bicep` (0.7 KB)
  - ✅ `app-service-plan.bicep` (0.5 KB)
  - ✅ `function-app.bicep` (3.9 KB)

### Parameter Files (Pre-Filled)
- **Development**: ✅ `parameters.dev.json`
  - ✅ Key Vault references configured
  - ✅ Dataverse URL: `https://skyline365-qa.crm4.dynamics.com/`
  - ✅ Dataverse Client ID: `acd01a7c-7c83-4977-a98d-ade9e82ae6e8`
  - ✅ Tenant ID: `5f175691-8d1c-4932-b7c8-ce990839ac40`
  - ✅ CORS Origins: `http://localhost:5173,http://localhost:4173`

## 📦 Resources to Deploy

| Resource Type | Quantity | SKU/Tier | Cost |
|---|---|---|---|
| Function App | 1 | Node.js 20 | Pay-per-execution |
| Storage Account | 1 | StorageV2 LRS | ~$2/month |
| App Service Plan | 1 | Consumption (Y1) | Included with Functions |
| Application Insights | 1 | Pay-as-you-go | ~$1/month |
| **Estimated Monthly Cost** | | | **~$3/month** |

## 🔧 Azure Functions Configuration

### HTTP Endpoints
```
GET    /api/subscriptions
POST   /api/subscriptions
PUT    /api/subscriptions/{id}
DELETE /api/subscriptions/{id}
POST   /api/notify
```

### Timer Triggers
- **digestDaily**: `0 6 * * *` (6:00 UTC daily)
- **digestWeekly**: `0 7 * * 1` (Monday 7:00 UTC)
- **digestMonthly**: `0 8 1 * *` (1st of month 8:00 UTC)

### App Settings (Auto-Configured)
```
DATAVERSE_URL=https://skyline365-qa.crm4.dynamics.com/
DATAVERSE_CLIENT_ID=acd01a7c-7c83-4977-a98d-ade9e82ae6e8
DATAVERSE_CLIENT_SECRET=<from Key Vault>
SENDGRID_API_KEY=<from Key Vault>
OPENAI_API_KEY=<from Key Vault>
ENTRA_ID_TENANT_ID=5f175691-8d1c-4932-b7c8-ce990839ac40
FUNCTION_CLIENT_ID=acd01a7c-7c83-4977-a98d-ade9e82ae6e8
INSTANT_COOLDOWN_MINUTES=15
```

## 🚀 Deployment Instructions

### Step 1: Validate Templates
```batch
# Windows
Infrastructure\validate.bat

# macOS/Linux
bash Infrastructure/validate.sh
```

### Step 2: Deploy Infrastructure
```batch
# Windows
set RESOURCE_GROUP=rg-dynamics-activities
set ENVIRONMENT=dev
Infrastructure\deploy.bat

# macOS/Linux
export RESOURCE_GROUP=rg-dynamics-activities
export ENVIRONMENT=dev
bash Infrastructure/deploy.sh
```

### Step 3: Deploy Function Code
```bash
cd functions
func azure functionapp publish dmact-func-dev-<suffix> --build remote --build-native-deps
```

### Step 4: Configure Dataverse Webhook
Register webhook in **Dataverse > Settings > Plug-in Assemblies**:
```
Method: POST
URL: https://dmact-func-dev-<suffix>.azurewebsites.net/api/notify
Events: create on phonecalls, appointments, emails, slc_escalations
```

### Step 5: Update Frontend
Update `.env.dataminer`:
```env
VITE_FUNCTIONS_BASE_URL=https://dmact-func-dev-<suffix>.azurewebsites.net/api
```

## ✅ Validation Results

| Check | Status | Details |
|---|---|---|
| Bicep Syntax | ✅ PASS | All templates validated |
| Parameter JSON | ✅ PASS | Valid JSON format |
| Key Vault | ✅ PASS | Created & accessible |
| Secrets | ✅ PASS | All 3 secrets configured |
| RBAC | ✅ PASS | ARM deployment permissions granted |
| Resource Group | ✅ PASS | Created in eastus |

## 📋 Deployment Checklist

Before deploying, ensure:

- [ ] Azure CLI installed and authenticated
- [ ] User has Owner/Contributor role on subscription
- [ ] Key Vault has ARM deployment access enabled ✅
- [ ] All secrets created in Key Vault ✅
- [ ] Parameter files have correct Key Vault reference ✅
- [ ] Resource group exists ✅

## 🔐 Security Considerations

✅ **Secrets Management**
- All API keys stored in Key Vault (not in code)
- ARM templates have Key Vault reference access
- Secrets never logged or displayed

✅ **Network Security**
- HTTPS enforced on Function App
- TLS 1.2 minimum required
- CORS configured for frontend origins

✅ **Authentication**
- Entra ID (Azure AD) authentication for all endpoints
- Bearer token validation on all HTTP triggers
- Managed identity for Function App

## 📞 Troubleshooting

### Quota Errors
If you see "SubscriptionIsOverQuotaForSku", the subscription may have resource limits. 
- Contact Azure support to request quota increase
- The Function App uses Consumption tier (typically free tier)

### Key Vault Access Denied
- ✅ Already resolved - ARM deployment access enabled
- Verify Key Vault firewall allows ARM service

### Secret Reference Failed
- Ensure Key Vault ID in parameters.dev.json is correct ✅
- Verify secrets exist in Key Vault ✅

## 📚 Documentation Files

- **README.md** - Complete setup guide
- **QUICKSTART.md** - Fast deployment reference
- **DEPLOYMENT_SUMMARY.md** - Deployment overview
- **DEPLOYMENT_READY.md** - This file (pre-deployment checklist)

## 🎯 Next Steps

1. ✅ All prerequisites met
2. ✅ All parameters configured
3. ✅ All secrets created
4. ✅ All templates validated

**Ready to deploy!** Run deployment scripts in order above.

---

**Generated**: 2026-06-26
**Status**: Production-Ready for Deployment

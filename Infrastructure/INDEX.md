# Infrastructure Deployment Package - INDEX

## 🎯 Start Here

**New to this infrastructure?** Start with [QUICK_REFERENCE.md](QUICK_REFERENCE.md) for a one-page overview.

**Ready to deploy?** Execute: `deploy.bat` (Windows) or `bash deploy.sh` (Linux/macOS)

## 📚 Documentation

Choose based on your needs:

### For Quick Deployment
- **[QUICK_REFERENCE.md](QUICK_REFERENCE.md)** - One-page deployment guide (start here!)
- **[QUICKSTART.md](QUICKSTART.md)** - Fast reference with common tasks

### For Complete Understanding
- **[README.md](README.md)** - Complete setup guide with all details
- **[DEPLOYMENT_SUMMARY.md](DEPLOYMENT_SUMMARY.md)** - Overview of what's being deployed
- **[DEPLOYMENT_READY.md](DEPLOYMENT_READY.md)** - Pre-flight validation checklist

### For Reference
- **[MANIFEST.md](MANIFEST.md)** - File inventory
- **[COMPLETION_REPORT.md](COMPLETION_REPORT.md)** - Delivery summary
- **[INDEX.md](INDEX.md)** - This file

## 🏗️ Infrastructure Files

### Templates
```
main.bicep                          # Main orchestration
modules/
  ├─ storage.bicep                  # Storage Account
  ├─ app-insights.bicep             # Application Insights
  ├─ app-service-plan.bicep         # Consumption Plan
  └─ function-app.bicep             # Function App
```

### Configuration
```
parameters.dev.json                 # ✅ FULLY CONFIGURED - Use this
parameters.prod.json                # Production template
```

### Deployment Scripts
```
deploy.bat                          # Windows deployment
deploy.sh                           # Linux/macOS deployment
validate.bat                        # Windows validation
validate.sh                         # Linux/macOS validation
```

## ✅ Pre-Flight Checklist

See [DEPLOYMENT_READY.md](DEPLOYMENT_READY.md) for complete checklist. Quick version:

- [x] Bicep templates validated
- [x] Parameters configured
- [x] Key Vault setup
- [x] Secrets created
- [x] RBAC permissions
- [x] Resource group created

## 🚀 Deployment Steps

1. **Validate** (optional)
   ```batch
   validate.bat
   ```

2. **Deploy Infrastructure**
   ```batch
   set RESOURCE_GROUP=rg-dynamics-activities
   set ENVIRONMENT=dev
   deploy.bat
   ```

3. **Deploy Function Code**
   ```bash
   cd ../functions
   func azure functionapp publish <APP_NAME> --build remote --build-native-deps
   ```

4. **Configure Dataverse**
   - Webhook URL: `https://<APP_NAME>.azurewebsites.net/api/notify`
   - Events: create on phonecalls, appointments, emails, slc_escalations

5. **Update Frontend**
   - File: `.env.dataminer`
   - Variable: `VITE_FUNCTIONS_BASE_URL=https://<APP_NAME>.azurewebsites.net/api`

## 📊 What Gets Deployed

- **Function App**: Node.js 20 (6 HTTP + 3 timer triggers)
- **Storage Account**: 4 tables (subscriptions, notifications, etc.)
- **App Service Plan**: Consumption tier (serverless)
- **Application Insights**: Monitoring & logging

## 💰 Cost

- **Dev**: ~$3/month
- **Prod**: ~$9/month

## 🆘 Troubleshooting

**Deployment fails?** Check [README.md#Troubleshooting](README.md#troubleshooting)

**Can't find Function App name?**
```
az functionapp list -g rg-dynamics-activities --query "[].name" -o tsv
```

**View deployment logs?**
```
func azure functionapp logstream <APP_NAME>
```

## 📋 Configuration Reference

**Subscription**: sub-bpa-test  
**Region**: eastus  
**Tenant**: 5f175691-8d1c-4932-b7c8-ce990839ac40  
**Key Vault**: kv-dynamics-748  
**Dataverse URL**: https://skyline365-qa.crm4.dynamics.com/  

## ✨ Status

**🎉 PRODUCTION-READY** 🎉

All files validated and configured. Ready for deployment.

---

**Questions?**
- Comprehensive guide: [README.md](README.md)
- Quick start: [QUICKSTART.md](QUICKSTART.md)
- One-page ref: [QUICK_REFERENCE.md](QUICK_REFERENCE.md)

**Next step**: Execute `deploy.bat`

// Main infrastructure for DynamicsActivities notification functions
// Deploys: Function App, Storage, Application Insights, and configuration

metadata description = 'DynamicsActivities Notification System Infrastructure'

@minLength(1)
@maxLength(20)
@description('Name prefix for all resources (e.g., "dmact")')
param namePrefix string

@description('Azure region for resource deployment')
param location string = resourceGroup().location

@description('Environment: dev, staging, or prod')
@allowed(['dev', 'staging', 'prod'])
param environment string = 'dev'

@description('Dataverse organization URL (e.g., https://org.crm4.dynamics.com/)')
param dataverseUrl string

@description('Dataverse client ID for OAuth')
param dataverseClientId string

@description('Dataverse client secret')
@secure()
param dataverseClientSecret string

@description('SendGrid API key for email delivery')
@secure()
param sendGridApiKey string

@description('Entra ID tenant ID')
param entraIdTenantId string

@description('Entra ID audience (client ID) for Function app JWT validation')
param entraAudience string

@description('Shared secret for validating incoming Dataverse webhook calls')
@secure()
param webhookSecret string

@description('HMAC secret for signing email action tokens')
@secure()
param actionTokenSecret string

@description('Base URL of the SPA (used for email links)')
param spaBaseUrl string = 'https://solutionsdma-skyline.on.dataminer.services/public/DynamicsActivities/'

@description('SendGrid from email address')
param sendGridFromEmail string

@description('SendGrid from display name')
param sendGridFromName string = 'Skyline Activities'

@description('Azure OpenAI API key (optional — falls back to rule-based summaries if empty)')
@secure()
param azureOpenAiKey string = ''

@description('Azure OpenAI endpoint URL (optional)')
param azureOpenAiEndpoint string = ''

@description('Azure OpenAI deployment name (optional)')
param azureOpenAiDeployment string = ''

@description('Allowed frontend origins for CORS (comma-separated)')
param corsOrigins string = 'http://localhost:5173,http://localhost:4173'

@description('Instant notification cooldown in minutes')
param instantCooldownMinutes int = 15

// Resource naming
var suffix = uniqueString(resourceGroup().id)
var appName = '${namePrefix}-func-${environment}-${take(suffix, 6)}'
var storageName = replace('${namePrefix}stor${environment}${take(suffix, 6)}', '-', '')
var appInsightsName = '${namePrefix}-ai-${environment}'
var appServicePlanName = '${namePrefix}-plan-${environment}'

// Deploy Storage Account for Table Storage (subscriptions, notifications, etc.)
module storageModule './modules/storage.bicep' = {
  name: 'storage-deployment'
  params: {
    storageName: storageName
    location: location
    environment: environment
  }
}

// Deploy Application Insights for monitoring
module appInsightsModule './modules/app-insights.bicep' = {
  name: 'appinsights-deployment'
  params: {
    appInsightsName: appInsightsName
    location: location
    environment: environment
  }
}

// Deploy App Service Plan (Consumption tier for serverless)
module appServicePlanModule './modules/app-service-plan.bicep' = {
  name: 'appserviceplan-deployment'
  params: {
    appServicePlanName: appServicePlanName
    location: location
  }
}

// Deploy Function App with Node.js runtime
module functionAppModule './modules/function-app.bicep' = {
  name: 'functionapp-deployment'
  params: {
    appName: appName
    appServicePlanId: appServicePlanModule.outputs.appServicePlanId
    location: location
    storageConnectionString: storageModule.outputs.connectionString
    appInsightsConnectionString: appInsightsModule.outputs.connectionString
    dataverseUrl: dataverseUrl
    dataverseClientId: dataverseClientId
    dataverseClientSecret: dataverseClientSecret
    dataverseTenantId: entraIdTenantId
    sendGridApiKey: sendGridApiKey
    sendGridFromEmail: sendGridFromEmail
    sendGridFromName: sendGridFromName
    azureOpenAiKey: azureOpenAiKey
    azureOpenAiEndpoint: azureOpenAiEndpoint
    azureOpenAiDeployment: azureOpenAiDeployment
    entraIdTenantId: entraIdTenantId
    entraAudience: entraAudience
    webhookSecret: webhookSecret
    actionTokenSecret: actionTokenSecret
    spaBaseUrl: spaBaseUrl
    corsOrigins: corsOrigins
    instantCooldownMinutes: instantCooldownMinutes
  }
}

// Outputs for deployment reference
@description('Function App name')
output functionAppName string = functionAppModule.outputs.functionAppName

@description('Function App base URL')
output functionAppUrl string = functionAppModule.outputs.functionAppUrl

@description('Storage Account name')
output storageAccountName string = storageModule.outputs.storageAccountName

@description('Application Insights instrumentation key')
output appInsightsInstrumentationKey string = appInsightsModule.outputs.instrumentationKey

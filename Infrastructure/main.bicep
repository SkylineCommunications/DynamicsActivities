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

@description('OpenAI API key for activity summaries')
@secure()
param openaiApiKey string

@description('Entra ID tenant ID')
param entraIdTenantId string

@description('Entra ID client ID for Function app authentication')
param functionClientId string

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
    sendGridApiKey: sendGridApiKey
    openaiApiKey: openaiApiKey
    entraIdTenantId: entraIdTenantId
    functionClientId: functionClientId
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

// Azure Function App for notification system
// Handles: Subscription CRUD, webhook notifications, digest timers, email actions

param appName string
param appServicePlanId string
param location string
param storageConnectionString string
param appInsightsConnectionString string
param dataverseUrl string
param dataverseClientId string
param dataverseTenantId string
@secure()
param dataverseClientSecret string
@secure()
param sendGridApiKey string
param sendGridFromEmail string
param sendGridFromName string = 'Skyline Activities'
@secure()
param azureOpenAiKey string = ''
param azureOpenAiEndpoint string = ''
param azureOpenAiDeployment string = ''
param entraIdTenantId string
param entraAudience string
@secure()
param webhookSecret string
@secure()
param actionTokenSecret string
param spaBaseUrl string
param corsOrigins string
param instantCooldownMinutes int = 15

resource functionApp 'Microsoft.Web/sites@2023-12-01' = {
  name: appName
  location: location
  kind: 'functionapp'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlanId
    httpsOnly: true
    siteConfig: {
      http20Enabled: true
      minTlsVersion: '1.2'
      nodeVersion: '~20'
      appSettings: [
        {
          name: 'AzureWebJobsStorage'
          value: storageConnectionString
        }
        {
          name: 'WEBSITE_CONTENTAZUREFILECONNECTIONSTRING'
          value: storageConnectionString
        }
        {
          name: 'WEBSITE_CONTENTSHARE'
          value: toLower(appName)
        }
        {
          name: 'FUNCTIONS_EXTENSION_VERSION'
          value: '~4'
        }
        {
          name: 'FUNCTIONS_WORKER_RUNTIME'
          value: 'node'
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsightsConnectionString
        }
        {
          name: 'ApplicationInsightsAgent_EXTENSION_VERSION'
          value: '~3'
        }
        {
          name: 'XDT_MicrosoftApplicationInsights_Mode'
          value: 'recommended'
        }
        // Storage — tables.js reads AZURE_STORAGE_CONNECTION_STRING directly
        {
          name: 'AZURE_STORAGE_CONNECTION_STRING'
          value: storageConnectionString
        }
        // Dataverse configuration
        {
          name: 'DATAVERSE_URL'
          value: dataverseUrl
        }
        {
          name: 'DATAVERSE_CLIENT_ID'
          value: dataverseClientId
        }
        {
          name: 'DATAVERSE_CLIENT_SECRET'
          value: dataverseClientSecret
        }
        {
          name: 'DATAVERSE_TENANT_ID'
          value: dataverseTenantId
        }
        // SendGrid configuration
        {
          name: 'SENDGRID_API_KEY'
          value: sendGridApiKey
        }
        {
          name: 'SENDGRID_FROM_EMAIL'
          value: sendGridFromEmail
        }
        {
          name: 'SENDGRID_FROM_NAME'
          value: sendGridFromName
        }
        // Azure OpenAI configuration (optional — falls back to rule-based summaries if empty)
        {
          name: 'AZURE_OPENAI_KEY'
          value: azureOpenAiKey
        }
        {
          name: 'AZURE_OPENAI_ENDPOINT'
          value: azureOpenAiEndpoint
        }
        {
          name: 'AZURE_OPENAI_DEPLOYMENT'
          value: azureOpenAiDeployment
        }
        // Entra ID / auth configuration
        {
          name: 'ENTRA_TENANT_ID'
          value: entraIdTenantId
        }
        {
          name: 'ENTRA_AUDIENCE'
          value: entraAudience
        }
        // Notification security — must be set manually after deployment
        {
          name: 'WEBHOOK_SECRET'
          value: webhookSecret
        }
        {
          name: 'ACTION_TOKEN_SECRET'
          value: actionTokenSecret
        }
        // URL configuration
        {
          name: 'SPA_BASE_URL'
          value: spaBaseUrl
        }
        {
          name: 'FUNCTIONS_BASE_URL'
          value: 'https://${appName}.azurewebsites.net/api'
        }
        // Notification settings
        {
          name: 'INSTANT_COOLDOWN_MINUTES'
          value: string(instantCooldownMinutes)
        }
      ]
      cors: {
        allowedOrigins: split(corsOrigins, ',')
        supportCredentials: false
      }
      use32BitWorkerProcess: false
    }
  }
}

output functionAppName string = functionApp.name
output functionAppUrl string = 'https://${functionApp.properties.defaultHostName}/api'
output functionAppId string = functionApp.id
output functionAppPrincipalId string = functionApp.identity.principalId

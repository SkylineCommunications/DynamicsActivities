// Azure Function App for notification system
// Handles: Subscription CRUD, webhook notifications, digest timers, email actions

param appName string
param appServicePlanId string
param location string
param storageConnectionString string
param appInsightsConnectionString string
param dataverseUrl string
param dataverseClientId string
@secure()
param dataverseClientSecret string
param entraIdTenantId string
@secure()
param sendGridApiKey string
param sendGridFromEmail string
param sendGridFromName string = 'Skyline Activities'
param openaiEndpoint string
param openaiDeployment string = 'gpt-4o'
@secure()
param openaiApiKey string
@secure()
param webhookSecret string
@secure()
param actionTokenSecret string
param spaBaseUrl string
param corsOrigins string
param instantCooldownMinutes int = 15

// Derive ENTRA_AUDIENCE from dataverseUrl (strip trailing slash so it matches JWT aud claim)
var entraAudience = endsWith(dataverseUrl, '/') ? substring(dataverseUrl, 0, length(dataverseUrl) - 1) : dataverseUrl

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
          value: entraIdTenantId
        }
        // Azure Table Storage
        {
          name: 'AZURE_STORAGE_CONNECTION_STRING'
          value: storageConnectionString
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
        // Azure OpenAI configuration
        {
          name: 'AZURE_OPENAI_ENDPOINT'
          value: openaiEndpoint
        }
        {
          name: 'AZURE_OPENAI_KEY'
          value: openaiApiKey
        }
        {
          name: 'AZURE_OPENAI_DEPLOYMENT'
          value: openaiDeployment
        }
        // Webhook and email action secrets
        {
          name: 'WEBHOOK_SECRET'
          value: webhookSecret
        }
        {
          name: 'ACTION_TOKEN_SECRET'
          value: actionTokenSecret
        }
        // Entra ID / JWT validation
        {
          name: 'ENTRA_TENANT_ID'
          value: entraIdTenantId
        }
        {
          name: 'ENTRA_AUDIENCE'
          value: entraAudience
        }
        // SPA URL for email action links
        {
          name: 'SPA_BASE_URL'
          value: spaBaseUrl
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

// Diagnostic settings for logging (optional, can be removed if not needed)
// resource functionAppDiagnostics 'Microsoft.Insights/diagnosticSettings@2017-05-01-preview' = {
//   name: 'diagnostics'
//   scope: functionApp
//   properties: {
//     logs: [
//       {
//         category: 'FunctionAppLogs'
//         enabled: true
//         retentionPolicy: {
//           enabled: true
//           days: environment == 'prod' ? 30 : 7
//         }
//       }
//     ]
//     metrics: [
//       {
//         category: 'AllMetrics'
//         enabled: true
//         retentionPolicy: {
//           enabled: true
//           days: environment == 'prod' ? 30 : 7
//         }
//       }
//     ]
//   }
// }

output functionAppName string = functionApp.name
output functionAppUrl string = 'https://${functionApp.properties.defaultHostName}/api'
output functionAppId string = functionApp.id
output functionAppPrincipalId string = functionApp.identity.principalId

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
@secure()
param sendGridApiKey string
@secure()
param openaiApiKey string
param entraIdTenantId string
param functionClientId string
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
        // SendGrid configuration
        {
          name: 'SENDGRID_API_KEY'
          value: sendGridApiKey
        }
        // OpenAI configuration
        {
          name: 'OPENAI_API_KEY'
          value: openaiApiKey
        }
        // Entra ID configuration
        {
          name: 'ENTRA_ID_TENANT_ID'
          value: entraIdTenantId
        }
        {
          name: 'FUNCTION_CLIENT_ID'
          value: functionClientId
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

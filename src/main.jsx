import React from 'react'
import ReactDOM from 'react-dom/client'
import { PublicClientApplication } from '@azure/msal-browser'
import { MsalProvider } from '@azure/msal-react'
import { msalConfig, msalConfigValid } from './authConfig'
import { bootstrapSession, isDataMinerHost } from './api/dataminer'
import App from './App'
import './styles/main.css'

const root = ReactDOM.createRoot(document.getElementById('root'))

if (!msalConfigValid) {
  root.render(
    <React.StrictMode>
      <div className="app">
        <div className="auth-screen">
          <div className="auth-card">
            <div className="auth-icon">⚠️</div>
            <h2>Configuration Missing</h2>
            <p>
              Required environment variables are not set. Please ensure the
              following are configured:
            </p>
            <ul>
              <li><code>VITE_CLIENT_ID</code></li>
              <li><code>VITE_TENANT_ID</code></li>
              <li><code>VITE_DATAVERSE_URL</code></li>
            </ul>
          </div>
        </div>
      </div>
    </React.StrictMode>,
  )
} else {
  if (isDataMinerHost()) {
    bootstrapSession({ redirectOnFailure: true }).catch(() => {})
  }

  const msalInstance = new PublicClientApplication(msalConfig)

  root.render(
    <React.StrictMode>
      <MsalProvider instance={msalInstance}>
        <App />
      </MsalProvider>
    </React.StrictMode>,
  )
}

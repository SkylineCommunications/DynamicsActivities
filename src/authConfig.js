const dataverseUrl = (import.meta.env.VITE_DATAVERSE_URL || '').replace(/\/$/, '')

const clientId = import.meta.env.VITE_CLIENT_ID || ''
const tenantId = import.meta.env.VITE_TENANT_ID || ''

export const msalConfigValid = !!(clientId && tenantId && dataverseUrl)

export const msalConfig = {
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    redirectUri: import.meta.env.VITE_REDIRECT_URI || window.location.origin,
    navigateToLoginRequestUrl: false,
  },
  cache: {
    cacheLocation: 'localStorage',
    storeAuthStateInCookie: false,
  },
}

// Scopes for initial login (Graph)
export const loginRequest = {
  scopes: ['User.Read', 'Calendars.Read', 'Mail.Read', 'Mail.Read.Shared'],
}

// Scopes for Dataverse token
export const dataverseRequest = {
  scopes: [`${dataverseUrl}/.default`],
}

// Scopes for Graph calendar
export const graphRequest = {
  scopes: [
    'https://graph.microsoft.com/Calendars.Read',
    'https://graph.microsoft.com/Mail.Read',
    'https://graph.microsoft.com/Mail.Read.Shared',
  ],
}

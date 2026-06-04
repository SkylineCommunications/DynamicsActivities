const dataverseUrl = (import.meta.env.VITE_DATAVERSE_URL || '').replace(/\/$/, '')

export const msalConfig = {
  auth: {
    clientId: import.meta.env.VITE_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_TENANT_ID}`,
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
  scopes: ['User.Read', 'Calendars.Read'],
}

// Scopes for Dataverse token
export const dataverseRequest = {
  scopes: [`${dataverseUrl}/.default`],
}

// Scopes for Graph calendar
export const graphRequest = {
  scopes: ['https://graph.microsoft.com/Calendars.Read'],
}

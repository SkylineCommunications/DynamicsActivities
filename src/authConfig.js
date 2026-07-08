const dataverseUrl = (import.meta.env.VITE_DATAVERSE_URL || '').replace(/\/$/, '')
const clientId = import.meta.env.VITE_CLIENT_ID || ''
const tenantId = import.meta.env.VITE_TENANT_ID || ''
const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname)

function normalizePath(path) {
  const trimmed = String(path || '').trim()
  if (!trimmed) return '/'
  const withLeading = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`
}

const appBasePath = normalizePath(
  import.meta.env.VITE_APP_BASE_PATH || (isLocalHost ? '/' : '/public/DynamicsActivities/'),
)

function buildAbsoluteUrl(path) {
  return new URL(path, window.location.origin).toString()
}

const configuredRedirectUri = import.meta.env.VITE_REDIRECT_URI || ''
const redirectUri = configuredRedirectUri || buildAbsoluteUrl(`${appBasePath}auth-callback`)
const postLogoutRedirectUri = buildAbsoluteUrl(appBasePath)
const redirectPathname = new URL(redirectUri, window.location.origin).pathname

export const msalConfigValid = !!(clientId && tenantId && dataverseUrl)

export const msalConfig = {
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    redirectUri,
    postLogoutRedirectUri,
    navigateToLoginRequestUrl: true,
  },
  cache: {
    cacheLocation: 'localStorage',
    storeAuthStateInCookie: false,
  },
}

export { appBasePath, redirectPathname }

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

// Scopes for Skyline collaboration API
export const skylineRequest = {
  scopes: [import.meta.env.VITE_SKYLINE_SCOPE || 'api://53d05a51-7b85-4f10-a44b-69f97640b152/.default'],
}

export const skylineApiUrl = (import.meta.env.VITE_SKYLINE_API_URL || 'https://api.skyline.be').replace(/\/$/, '')

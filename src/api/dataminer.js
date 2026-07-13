// ─── DataMiner session management ────────────────────────────────────────────
// Users sign in through DataMiner's /auth/ page which sets a DMAConnection
// cookie. This module reads and verifies that cookie.

const JSON_API = `${window.location.protocol}//${window.location.host}/API/v1/Json.asmx`
const DM_SESSION_RETRY_ATTEMPTS = 6
const DM_SESSION_RETRY_DELAY_MS = 400
const CONNECTION_STORAGE_KEY = 'dm_connection_guid'
let activeConnection = null

function readStoredConnection() {
  try {
    return sessionStorage.getItem(CONNECTION_STORAGE_KEY)
  } catch {
    return null
  }
}

function persistConnection(connection) {
  if (!connection) return
  activeConnection = connection
  try {
    sessionStorage.setItem(CONNECTION_STORAGE_KEY, connection)
  } catch {
    // ignore storage failures (private mode, quota, etc.)
  }
}

function clearPersistedConnection() {
  activeConnection = null
  try {
    sessionStorage.removeItem(CONNECTION_STORAGE_KEY)
  } catch {
    // ignore storage failures
  }
}

export function getConnectionFromCookie() {
  const match = document.cookie.match(/(?:^|;\s*)DMAConnection=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : null
}

export function getConnection() {
  return activeConnection || getConnectionFromCookie() || readStoredConnection()
}

export function getDmaUser() {
  const match = document.cookie.match(/(?:^|;\s*)DMAUser=([^;]+)/)
  if (!match) return null
  try {
    return JSON.parse(decodeURIComponent(match[1]))
  } catch {
    return null
  }
}

export function redirectToAuth() {
  const target = location.pathname + location.search
  location.replace('/auth/?url=' + encodeURIComponent(target))
}

export function signOut() {
  sessionStorage.removeItem('dm_auth_attempted')
  clearPersistedConnection()
  const target = location.pathname + location.search
  location.replace('/auth/logout?url=' + encodeURIComponent(target))
}

export function isConnectionAliveResult(result) {
  return result === true || result === 'true' || result === 1 || result === '1'
}

export async function jsonPost(method, body, options = {}) {
  const { redirectOnAuthFailure = true } = options
  const r = await fetch(`${JSON_API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  })
  if (r.status === 401 || r.status === 403) {
    if (redirectOnAuthFailure) redirectToAuth()
    return null
  }
  const json = await r.json()
  if (r.status === 500 && json?.ExceptionType?.includes('NoConnectionWebApiException')) {
    if (redirectOnAuthFailure) redirectToAuth()
    return null
  }
  return json.d
}

export async function validateConnection(connection, options = {}) {
  const { redirectOnFailure = true } = options
  if (!connection) return false

  const alive = await jsonPost('IsConnectionAlive', { connection }, { redirectOnAuthFailure: redirectOnFailure })
  if (!isConnectionAliveResult(alive)) {
    clearPersistedConnection()
    return false
  }

  persistConnection(connection)
  return true
}

/**
 * Bootstrap the DataMiner session on app load.
 * Returns the connection GUID if valid, null otherwise (and redirects to /auth/).
 */
export async function bootstrapSession(options = {}) {
  const { redirectOnFailure = true, maxAttempts = DM_SESSION_RETRY_ATTEMPTS, retryDelayMs = DM_SESSION_RETRY_DELAY_MS } = options

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const connection = getConnection()
    if (connection) {
      const ok = await validateConnection(connection, { redirectOnFailure })
      if (ok) {
        sessionStorage.removeItem('dm_auth_attempted')
        return connection
      }
    }

    const hasAttemptsLeft = attempt + 1 < maxAttempts
    if (hasAttemptsLeft && retryDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
    }
  }

  // No valid session — redirect unless we already tried
  if (redirectOnFailure && !sessionStorage.getItem('dm_auth_attempted')) {
    sessionStorage.setItem('dm_auth_attempted', '1')
    redirectToAuth()
  }
  return null
}

/**
 * Check if we're running on a DataMiner host (has /auth/ and /API/).
 * In local dev (localhost), we skip DMA session and use MSAL popup directly.
 */
export function isDataMinerHost() {
  return !['localhost', '127.0.0.1'].includes(location.hostname)
}

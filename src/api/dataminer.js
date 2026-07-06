// ─── DataMiner session management ────────────────────────────────────────────
// Users sign in through DataMiner's /auth/ page which sets a DMAConnection
// cookie. This module reads and verifies that cookie.

const JSON_API = `${window.location.protocol}//${window.location.host}/API/v1/Json.asmx`

export function getConnectionFromCookie() {
  const match = document.cookie.match(/(?:^|;\s*)DMAConnection=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : null
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
  const target = location.pathname + location.search
  location.replace('/auth/logout?url=' + encodeURIComponent(target))
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

/**
 * Bootstrap the DataMiner session on app load.
 * Returns the connection GUID if valid, null otherwise (and redirects to /auth/).
 */
export async function bootstrapSession(options = {}) {
  const { redirectOnFailure = true } = options
  const connection = getConnectionFromCookie()
  if (connection) {
    const ok = await jsonPost('IsConnectionAlive', { connection }, { redirectOnAuthFailure: redirectOnFailure })
    if (ok !== null) {
      sessionStorage.removeItem('dm_auth_attempted')
      return connection
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

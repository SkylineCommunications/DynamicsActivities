import { InteractionRequiredAuthError } from '@azure/msal-browser'
import { skylineRequest, skylineApiUrl } from '../authConfig'

// ─── Skyline Collaboration API client ────────────────────────────────────────
// All functions degrade gracefully: if the Skyline API is unreachable, token
// cannot be obtained, or CORS blocks the call, they return null/[] and log a
// warning — the app continues without TAM features.

const API = skylineApiUrl

async function getSkylineToken(msalInstance) {
  const accounts = msalInstance.getAllAccounts()
  if (!accounts.length) return null
  const account = accounts[0]
  try {
    const r = await msalInstance.acquireTokenSilent({ ...skylineRequest, account })
    return r.accessToken
  } catch (e) {
    if (e instanceof InteractionRequiredAuthError) {
      const r = await msalInstance.acquireTokenPopup({ ...skylineRequest, account })
      return r.accessToken
    }
    console.warn('[Skyline] Token acquisition failed:', e.message)
    return null
  }
}

async function skyFetch(msalInstance, path) {
  const token = await getSkylineToken(msalInstance)
  if (!token) return null
  const res = await fetch(`${API}/${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Skyline ${path} → ${res.status}`)
  return res.json()
}

/**
 * Get the current user from the Skyline collaboration platform.
 * @returns {{ ID, Name, Email, ... } | null}
 */
export async function getCurrentSkylineUser(msalInstance) {
  try {
    return await skyFetch(msalInstance, 'api/Users/Mine')
  } catch (e) {
    console.warn('[Skyline] getCurrentSkylineUser failed:', e.message)
    return null
  }
}

/**
 * Fetch the list of customers the current user is TAM for.
 * @returns {Array<{ name: string, acronym: string }>}
 */
export async function getMyManagedCustomers(msalInstance) {
  try {
    const user = await getCurrentSkylineUser(msalInstance)
    if (!user?.ID) return []

    const customers = await skyFetch(msalInstance, 'api/Customers')
    if (!Array.isArray(customers)) return []

    return customers
      .filter(c => Array.isArray(c.TAMs) && c.TAMs.some(t => String(t.ID) === String(user.ID)))
      .map(c => ({ name: c.Name, acronym: c.Acronym }))
  } catch (e) {
    console.warn('[Skyline] getMyManagedCustomers failed:', e.message)
    return []
  }
}

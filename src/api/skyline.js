import { InteractionRequiredAuthError } from '@azure/msal-browser'
import { skylineRequest, skylineApiUrl } from '../authConfig'
import { isDataMinerHost, getConnectionFromCookie, jsonPost } from './dataminer'

// ─── Skyline Collaboration API client ────────────────────────────────────────
// All functions degrade gracefully: if the Skyline API is unreachable, token
// cannot be obtained, or CORS blocks the call, they return null/[] and log a
// warning — the app continues without TAM features.
//
// On DataMiner hosts, calls are proxied through an automation script to avoid
// CORS issues with api.skyline.be.

const API = skylineApiUrl
let skylineTokenPromise = null

async function getSkylineToken(msalInstance) {
  if (skylineTokenPromise) return skylineTokenPromise

  skylineTokenPromise = (async () => {
    const accounts = msalInstance.getAllAccounts()
    if (!accounts.length) return null
    const account = accounts[0]

    try {
      const r = await msalInstance.acquireTokenSilent({ ...skylineRequest, account })
      return r.accessToken
    } catch (e) {
      if (e instanceof InteractionRequiredAuthError) {
        try {
          const r = await msalInstance.acquireTokenPopup({ ...skylineRequest, account })
          return r.accessToken
        } catch (popupErr) {
          console.warn('[Skyline] Popup consent failed:', popupErr?.message ?? popupErr)
          return null
        }
      }
      console.warn('[Skyline] Token acquisition failed:', e?.message ?? e)
      return null
    }
  })()

  try {
    return await skylineTokenPromise
  } finally {
    skylineTokenPromise = null
  }
}

/**
 * Fetch from Skyline API. On DataMiner hosts, proxies through an automation
 * script (DynamicsActivities_SkylineApiProxy) to avoid CORS.
 * On localhost (dev), calls directly.
 */
async function skyFetch(msalInstance, path) {
  const token = await getSkylineToken(msalInstance)
  if (!token) return null

  if (isDataMinerHost()) {
    const connection = getConnectionFromCookie()
    if (!connection) return null

    const result = await jsonPost('ExecuteAutomationScriptWithOutput', {
      connection,
      script: {
        __type: 'Skyline.DataMiner.Web.Common.v1.DMAAutomationScript',
        Name: 'DynamicsActivities_SkylineApiProxy',
        Folder: '',
        Description: '',
        Settings: {
          __type: 'Skyline.DataMiner.Web.Common.v1.DMAAutomationScriptSettings',
          RequireInteractive: false,
          HasFindInteractiveClient: false,
        },
        Parameters: [
          {
            __type: 'Skyline.DataMiner.Web.Common.v1.DMAAutomationScriptParameter',
            ParameterId: 1, Values: null, MemoryFile: '',
            Name: 'Path', Value: path,
          },
          {
            __type: 'Skyline.DataMiner.Web.Common.v1.DMAAutomationScriptParameter',
            ParameterId: 2, Values: null, MemoryFile: '',
            Name: 'Token', Value: token,
          },
        ],
        Dummies: [],
        MemoryFiles: [],
      },
      scriptOptions: {
        __type: 'Skyline.DataMiner.Web.Common.v1.DMAAutomationScriptOptions',
        WaitForScript: true, CheckSets: true, LockElements: false,
        ForceLockElements: false, WaitWhenLocked: true, IsInUse: false,
        AskForConfirmation: false, GenerateStartedInfoEvent: false,
        customSuccessMessage: null, hideSuccessPopup: true,
        skipPresetsIfComplete: true, hidePresets: true,
        popupIsMinimizable: false, popupType: 1,
        ClientTimeZone: { Type: 0, Info: null },
      },
    })

    if (!result || result.ErrorCode !== 0) return null
    const output = result.Output?.find(o => o.Name === 'result')
    if (!output) return null
    return JSON.parse(output.Value)
  }

  // Direct fetch for localhost dev
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
 * Fetch the customers managed by the current user.
 * Combines two sources:
 * 1. api/Customers → filter where user is in TAMs list
 * 2. api/Projects/Mine → extract customers from assigned projects
 * @returns {Array<{ name: string, acronym: string }>}
 */
export async function getMyManagedCustomers(msalInstance) {
  try {
    const user = await getCurrentSkylineUser(msalInstance)
    if (!user?.ID) return []

    const userId = String(user.ID)
    const seen = new Set()
    const customers = []

    const addCustomer = (name, acronym) => {
      if (name && !seen.has(name)) {
        seen.add(name)
        customers.push({ name, acronym: acronym || '' })
      }
    }

    // Source 1: Customers where user is listed as TAM
    const [allCustomers, projects] = await Promise.all([
      skyFetch(msalInstance, 'api/Customers').catch(() => null),
      skyFetch(msalInstance, 'api/Projects/Mine').catch(() => null),
    ])

    if (Array.isArray(allCustomers)) {
      for (const c of allCustomers) {
        const tams = c.TAMs || []
        if (tams.some(t => String(t.ID) === userId || String(t.$ref) === userId)) {
          addCustomer(c.Name, c.Acronym)
        }
      }
    }

    // Source 2: Customers from projects where user is TAM/Lead/PM/Contact
    if (Array.isArray(projects)) {
      const active = projects.filter(p => p.Status !== 'Closed')
      for (const p of active) {
        addCustomer(p.Customer?.Name, p.Customer?.Acronym)
      }
    }

    return customers
  } catch (e) {
    console.warn('[Skyline] getMyManagedCustomers failed:', e.message)
    return []
  }
}

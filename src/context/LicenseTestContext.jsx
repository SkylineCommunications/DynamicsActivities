import { createContext, useContext, useState, useCallback, useMemo } from 'react'

/**
 * Testing-only context that lets a tester override the detected license/access
 * state so they can preview the different views each user type receives.
 *
 * The override is persisted to localStorage so it survives reloads while
 * testing. Set the override back to "Auto (detected)" to restore real behavior.
 */

// Override values map to the distinct views the app can render.
export const LICENSE_OVERRIDES = [
  { value: '', label: 'Auto (detected)' },
  { value: 'none', label: 'No Dynamics license' },
  { value: 'no-dataverse', label: 'Dynamics, no Dataverse access' },
  { value: 'team-member', label: 'Team Member (full app)' },
  { value: 'sales', label: 'Sales / Enterprise (full app)' },
]

// CAL types considered sales-capable (mirrors SALES_CAL_TYPES in dataverse.js).
const SALES_CAL_TYPES = new Set([7, 8, 9, 10, 11, 12])

const STORAGE_KEY = 'dm-license-test-override'

const LicenseTestContext = createContext(null)

function readStoredOverride() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return LICENSE_OVERRIDES.some((o) => o.value === stored) ? stored : ''
  } catch {
    return ''
  }
}

export function LicenseTestProvider({ children }) {
  const [override, setOverrideState] = useState(readStoredOverride)
  const [detected, setDetectedState] = useState({
    hasLicense: null,
    dataverseAccessDenied: null,
    caltype: null,
  })

  const setOverride = useCallback((value) => {
    const next = LICENSE_OVERRIDES.some((o) => o.value === value) ? value : ''
    setOverrideState(next)
    try { localStorage.setItem(STORAGE_KEY, next) } catch {}
  }, [])

  const setDetected = useCallback((partial) => {
    setDetectedState((prev) => ({ ...prev, ...partial }))
  }, [])

  // Human-readable label describing what was actually detected on sign-in.
  const detectedLabel = useMemo(() => {
    if (detected.hasLicense === false) return 'No Dynamics license'
    if (detected.dataverseAccessDenied === true) return 'Dynamics, no Dataverse access'
    if (detected.hasLicense === true) {
      if (typeof detected.caltype === 'number') {
        const kind = SALES_CAL_TYPES.has(detected.caltype) ? 'Sales / Enterprise' : 'Team Member'
        return `${kind} (caltype ${detected.caltype})`
      }
      return 'Dynamics license'
    }
    return 'Detecting…'
  }, [detected])

  const value = useMemo(() => ({
    override,
    setOverride,
    detected,
    setDetected,
    detectedLabel,
  }), [override, setOverride, detected, setDetected, detectedLabel])

  return (
    <LicenseTestContext.Provider value={value}>
      {children}
    </LicenseTestContext.Provider>
  )
}

export function useLicenseTest() {
  const ctx = useContext(LicenseTestContext)
  if (!ctx) {
    throw new Error('useLicenseTest must be used within a LicenseTestProvider')
  }
  return ctx
}

/**
 * Resolve whether the current user can manage leads, honoring the test override.
 * @param {string} override - current license test override value
 * @param {boolean} detectedCanManage - real detected value
 */
export function resolveCanManageLeads(override, detectedCanManage) {
  if (override === 'sales') return true
  if (override === 'team-member') return false
  return detectedCanManage
}

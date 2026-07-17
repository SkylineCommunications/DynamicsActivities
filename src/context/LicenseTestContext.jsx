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

// CAL types that can create/manage leads in Dynamics Sales (mirrors
// SALES_CAL_TYPES in dataverse.js). Confirmed against the Dataverse Web API
// systemuser.caltype option set.
const SALES_CAL_TYPES = new Set([7, 8, 9, 10, 11, 12])

// Full systemuser.caltype option set → label, per the Dataverse Web API
// reference. Note: caltype is only reliably populated on-premises; in Dynamics
// 365 Online it often defaults to 0 (Professional) regardless of the real SKU,
// so treat the detected value as a hint and use the override to force a view.
const CALTYPE_LABELS = {
  0: 'Professional',
  1: 'Administrative',
  2: 'Basic',
  3: 'Device Professional',
  4: 'Device Basic',
  5: 'Essential',
  6: 'Device Essential',
  7: 'Enterprise',
  8: 'Device Enterprise',
  9: 'Sales',
  10: 'Service',
  11: 'Field Service',
  12: 'Project Service',
}

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
        const name = CALTYPE_LABELS[detected.caltype] ?? `CAL ${detected.caltype}`
        const kind = SALES_CAL_TYPES.has(detected.caltype) ? 'Sales' : 'Team Member'
        return `${name} · ${kind} (caltype ${detected.caltype})`
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

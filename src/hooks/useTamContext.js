import { useState, useEffect, useRef } from 'react'
import { useMsal } from '@azure/msal-react'
import { InteractionStatus } from '@azure/msal-browser'
import { getMyManagedCustomers } from '../api/skyline'
import { resolveAccountsByNames } from '../api/dataverse'

/**
 * Hook that resolves the current user's TAM-managed accounts (Skyline→Dataverse).
 * Loads once after MSAL is fully initialized. Degrades gracefully if anything fails.
 *
 * @returns {{ isTam: boolean, managedAccounts: Array<{accountid,name}>, loading: boolean }}
 */
export default function useTamContext() {
  const { instance, inProgress } = useMsal()
  const [managedAccounts, setManagedAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    if (inProgress !== InteractionStatus.None) return
    const accounts = instance.getAllAccounts()
    if (!accounts.length) {
      setLoading(false)
      return
    }
    ran.current = true
    setLoading(true)

    ;(async () => {
      try {
        const customers = await getMyManagedCustomers(instance)
        if (customers.length) {
          const resolved = await resolveAccountsByNames(instance, customers)
          setManagedAccounts(resolved)
        }
      } catch (e) {
        console.warn('[TAM] Context load failed:', e.message)
      } finally {
        setLoading(false)
      }
    })()
  }, [instance, inProgress])

  return {
    isTam: managedAccounts.length > 0,
    managedAccounts,
    loading,
  }
}

import { useState, useEffect } from 'react'
import { useIsAuthenticated, useMsal } from '@azure/msal-react'
import { InteractionStatus } from '@azure/msal-browser'
import { loginRequest } from '../authConfig'
import { whoAmI } from '../api/dataverse'
import { bootstrapSession, isDataMinerHost } from '../api/dataminer'

export default function AuthGuard({ children, onDmaConnection }) {
  const { instance, inProgress } = useMsal()
  const isAuthenticated = useIsAuthenticated()
  const [currentUserId, setCurrentUserId] = useState(null)
  const [authError, setAuthError] = useState(null)
  const [needsManualLogin, setNeedsManualLogin] = useState(false)
  const [dmaReady, setDmaReady] = useState(!isDataMinerHost()) // skip DMA check on localhost

  // Step 1: On DataMiner host, verify the DMA session cookie first
  useEffect(() => {
    if (!isDataMinerHost()) return
    bootstrapSession().then((conn) => {
      if (conn) {
        setDmaReady(true)
        onDmaConnection?.(conn)
      }
      // If null, bootstrapSession already redirected to /auth/
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Handle any pending redirect response at startup
  useEffect(() => {
    instance.handleRedirectPromise().catch(() => {})
  }, [instance])

  // Step 2: Once DMA is ready, try MSAL silent login.
  // On DataMiner host, user already signed in via Entra — try silent first.
  // On localhost, require a user gesture to open the popup.
  useEffect(() => {
    if (!dmaReady) return
    if (isAuthenticated || inProgress !== InteractionStatus.None) return

    if (isDataMinerHost()) {
      // Try silent SSO — user already signed in via DataMiner's Entra flow
      const accounts = instance.getAllAccounts()
      if (accounts.length) return // MSAL will pick up cached tokens
      instance.ssoSilent(loginRequest).catch(() => {
        // Silent failed — need popup consent
        setNeedsManualLogin(true)
      })
    } else {
      setNeedsManualLogin(true)
    }
  }, [dmaReady, isAuthenticated, inProgress, instance])

  // Clear transient states once authentication succeeds
  useEffect(() => {
    if (isAuthenticated) {
      setAuthError(null)
      setNeedsManualLogin(false)
    }
  }, [isAuthenticated])

  // Step 3: Once MSAL authenticated, fetch current user ID from Dataverse
  useEffect(() => {
    if (isAuthenticated && !currentUserId) {
      whoAmI(instance)
        .then((r) => setCurrentUserId(r.UserId))
        .catch((e) => setAuthError(`Dataverse connection failed: ${e.message}`))
    }
  }, [isAuthenticated, instance, currentUserId])

  function handleLogin() {
    setAuthError(null)
    setNeedsManualLogin(false)
    instance.loginPopup(loginRequest).catch((e) => {
      setAuthError(e.message)
      setNeedsManualLogin(true)
    })
  }

  // Waiting for DataMiner session verification
  if (!dmaReady) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-spinner" />
          <p>Verifying DataMiner session…</p>
        </div>
      </div>
    )
  }

  if (authError) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-icon"><span className="icon icon-lg" aria-hidden="true">warning</span></div>
          <h2>Authentication error</h2>
          <p className="auth-error">{authError}</p>
          <button className="btn-primary" onClick={handleLogin}>
            Retry login
          </button>
        </div>
      </div>
    )
  }

  if (needsManualLogin) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-icon"><span className="icon icon-lg" aria-hidden="true">lock</span></div>
          <h2>Sign in required</h2>
          <p>Sign in with your Microsoft account to access Dynamics 365.</p>
          <button className="btn-primary" onClick={handleLogin}>
            <span className="icon icon-sm" aria-hidden="true">login</span> Sign in
          </button>
        </div>
      </div>
    )
  }

  if (!isAuthenticated || !currentUserId) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-spinner" />
          <p>{!isAuthenticated ? 'Signing in…' : 'Connecting to Dynamics…'}</p>
        </div>
      </div>
    )
  }

  return children(currentUserId)
}
